-- CreateEnum
CREATE TYPE "point_reset_condition" AS ENUM ('NO_LOCKED_CASH', 'CASH_BELOW_LIMIT', 'RESET_INTERVAL_PASSED');

-- CreateEnum
CREATE TYPE "point_reset_result" AS ENUM ('SUCCESS', 'NOT_ALLOWED', 'CONFLICT');

-- CreateTable
CREATE TABLE "point_reset_histories" (
    "point_reset_history_id" BIGSERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "result" "point_reset_result" NOT NULL,
    "cash_before" BIGINT NOT NULL,
    "cash_after" BIGINT,
    "failed_conditions" "point_reset_condition"[],
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_reset_histories_pkey" PRIMARY KEY ("point_reset_history_id")
);

-- CreateIndex
CREATE INDEX "point_reset_histories_account_id_create_date_idx" ON "point_reset_histories"("account_id", "create_date");

-- AddForeignKey
ALTER TABLE "point_reset_histories" ADD CONSTRAINT "point_reset_histories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
