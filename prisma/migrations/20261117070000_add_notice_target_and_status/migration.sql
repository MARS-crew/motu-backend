BEGIN;

-- Earlier copies of this feature branch may have already added the enum value.
ALTER TYPE "admin_activity_action" ADD VALUE IF NOT EXISTS 'NOTICE_UPDATE' AFTER 'NOTICE_DELETE';

CREATE TYPE "notice_status" AS ENUM ('DRAFT', 'POSTED', 'HIDDEN');

ALTER TABLE "notices"
    ADD COLUMN "status" "notice_status" NOT NULL DEFAULT 'POSTED',
    ADD COLUMN "stock_id" INTEGER,
    ALTER COLUMN "post_start_date" DROP NOT NULL;

-- Preserve legacy stock notice content until an administrator selects the target.
UPDATE "notices" SET "status" = 'DRAFT' WHERE "notice_type" = 'STOCK';

ALTER TABLE "notices"
    ADD CONSTRAINT "notices_stock_id_fkey"
        FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "notices_target_check" CHECK (
        ("notice_type" = 'ALL' AND "stock_id" IS NULL) OR
        ("notice_type" = 'STOCK' AND ("stock_id" IS NOT NULL OR "status" = 'DRAFT'))
    ),
    ADD CONSTRAINT "notices_post_start_check" CHECK (
        "status" = 'DRAFT' OR "post_start_date" IS NOT NULL
    );

CREATE INDEX "notices_stock_id_idx" ON "notices"("stock_id");

COMMIT;
