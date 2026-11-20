ALTER TYPE "admin_activity_action" ADD VALUE 'LISTING_REVIEW_START';
ALTER TYPE "admin_activity_action" ADD VALUE 'LISTING_REVISION_DEADLINE_UPDATE';
ALTER TABLE "stocks" ADD COLUMN "approved_listing_date" DATE;
ALTER TABLE "stocks" ALTER COLUMN "official_url" TYPE VARCHAR(2048);
ALTER TABLE "listing_applications" ADD COLUMN "approval_data" JSONB, ADD COLUMN "stock_id" INTEGER;
CREATE UNIQUE INDEX "listing_applications_stock_id_key" ON "listing_applications"("stock_id");
ALTER TABLE "listing_applications" ADD CONSTRAINT "listing_applications_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listing_application_revisions" ADD COLUMN "request_items" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
