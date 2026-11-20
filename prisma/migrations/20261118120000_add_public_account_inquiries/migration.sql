CREATE TYPE "inquiry_source" AS ENUM ('RESTRICTED_ACCOUNT', 'PUBLIC_ACCOUNT_AUTH');

-- 기존 문의는 회원 관계와 회신 주소를 보존한다.
ALTER TABLE "inquiries"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "source" "inquiry_source" NOT NULL DEFAULT 'RESTRICTED_ACCOUNT';

ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_source_owner_check" CHECK (
  ("source" = 'RESTRICTED_ACCOUNT' AND "user_id" IS NOT NULL)
  OR ("source" = 'PUBLIC_ACCOUNT_AUTH' AND "user_id" IS NULL AND "reply_email" IS NOT NULL)
);

CREATE TABLE "inquiry_submission_limits" (
  "key" VARCHAR(64) NOT NULL,
  "count" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "inquiry_submission_limits_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "inquiry_submission_limits_expires_at_idx" ON "inquiry_submission_limits"("expires_at");
