-- CreateEnum
CREATE TYPE "admin_activity_target" AS ENUM ('LISTING_APPLICATION', 'STOCK', 'USER', 'ADMIN', 'NOTICE', 'ANOMALY');

-- CreateEnum
CREATE TYPE "admin_activity_action" AS ENUM ('LISTING_APPROVE', 'LISTING_REVISION_REQUEST', 'LISTING_REJECT', 'STOCK_UPDATE', 'STOCK_PAUSE', 'STOCK_RESUME', 'STOCK_CLOSE', 'USER_STATUS_CHANGE', 'USER_UNLOCK', 'POINT_GRANT', 'POINT_RECALL', 'ADMIN_CREATE', 'ADMIN_STATUS_CHANGE', 'NOTICE_PUBLISH', 'NOTICE_HIDE', 'NOTICE_DELETE', 'ANOMALY_ACTION');

-- CreateEnum
CREATE TYPE "admin_activity_result" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "admin_activity_logs" (
    "activity_log_id" BIGSERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "target_type" "admin_activity_target" NOT NULL,
    "target_id" BIGINT NOT NULL,
    "target_label" VARCHAR(100),
    "action" "admin_activity_action" NOT NULL,
    "result" "admin_activity_result" NOT NULL DEFAULT 'SUCCESS',
    "summary" VARCHAR(200),
    "before_value" JSONB,
    "after_value" JSONB,
    "reason" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("activity_log_id")
);

-- CreateIndex
CREATE INDEX "admin_activity_logs_create_date_idx" ON "admin_activity_logs"("create_date");

-- CreateIndex
CREATE INDEX "admin_activity_logs_admin_id_create_date_idx" ON "admin_activity_logs"("admin_id", "create_date");

-- CreateIndex
CREATE INDEX "admin_activity_logs_target_type_target_id_create_date_idx" ON "admin_activity_logs"("target_type", "target_id", "create_date");

-- AddForeignKey
ALTER TABLE "admin_activity_logs" ADD CONSTRAINT "admin_activity_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
