-- CreateEnum
CREATE TYPE "listing_application_status" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "listing_applications" (
    "application_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "application_number" VARCHAR(30),
    "status" "listing_application_status" NOT NULL DEFAULT 'DRAFT',
    "service_name" VARCHAR(30),
    "official_url" VARCHAR(2048),
    "normalized_official_url" VARCHAR(2048),
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "draft_data" JSONB NOT NULL DEFAULT '{}',
    "last_saved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listing_applications_pkey" PRIMARY KEY ("application_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_applications_application_number_key" ON "listing_applications"("application_number");

-- CreateIndex
CREATE INDEX "listing_applications_user_id_status_last_saved_at_idx" ON "listing_applications"("user_id", "status", "last_saved_at");

-- CreateIndex
CREATE INDEX "listing_applications_status_expires_at_idx" ON "listing_applications"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "listing_applications" ADD CONSTRAINT "listing_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 사용자·서버 인스턴스가 달라도 진행 중 공식 URL은 한 건만 허용한다.
-- 만료된 DRAFT는 API/주기 작업에서 EXPIRED로 변경한 후 URL을 다시 사용한다.
CREATE UNIQUE INDEX "listing_applications_active_url_key"
ON "listing_applications" ("normalized_official_url")
WHERE "deleted_date" IS NULL
  AND "normalized_official_url" IS NOT NULL
  AND "status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED');

ALTER TABLE "listing_applications"
ADD CONSTRAINT "listing_applications_current_step_check" CHECK ("current_step" BETWEEN 1 AND 4);
