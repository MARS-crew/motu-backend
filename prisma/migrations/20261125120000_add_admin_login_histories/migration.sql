-- CreateEnum
CREATE TYPE "admin_login_result" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "admin_login_failure_reason" AS ENUM ('INVALID_PASSWORD', 'ACCOUNT_LOCKED', 'ACCOUNT_BLOCKED', 'ACCOUNT_WITHDRAWN');

-- CreateTable
CREATE TABLE "admin_login_histories" (
    "login_history_id" BIGSERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "result" "admin_login_result" NOT NULL,
    "failure_reason" "admin_login_failure_reason",
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_histories_pkey" PRIMARY KEY ("login_history_id")
);

-- CreateIndex
CREATE INDEX "admin_login_histories_create_date_idx" ON "admin_login_histories"("create_date");

-- CreateIndex
CREATE INDEX "admin_login_histories_admin_id_create_date_idx" ON "admin_login_histories"("admin_id", "create_date");

-- AddForeignKey
ALTER TABLE "admin_login_histories" ADD CONSTRAINT "admin_login_histories_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
