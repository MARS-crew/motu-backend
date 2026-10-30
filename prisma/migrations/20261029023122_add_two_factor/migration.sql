-- CreateEnum
CREATE TYPE "two_factor_status" AS ENUM ('NOT_SET', 'ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "two_factor_action" AS ENUM ('ENABLED', 'PHONE_CHANGED', 'DISABLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "verification_purpose" ADD VALUE 'NEW_DEVICE_LOGIN';
ALTER TYPE "verification_purpose" ADD VALUE 'TWO_FACTOR_SETUP';
ALTER TYPE "verification_purpose" ADD VALUE 'TWO_FACTOR';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "order_activated_date" TIMESTAMPTZ(3),
ADD COLUMN     "two_factor_enabled_date" TIMESTAMPTZ(3),
ADD COLUMN     "two_factor_fail_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "two_factor_locked_until" TIMESTAMPTZ(3),
ADD COLUMN     "two_factor_phone_number" VARCHAR(11),
ADD COLUMN     "two_factor_status" "two_factor_status" NOT NULL DEFAULT 'NOT_SET',
ADD COLUMN     "two_factor_verified_date" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "trusted_devices" (
    "trusted_device_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "device_id_hash" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(255),
    "last_used_date" TIMESTAMPTZ(3) NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("trusted_device_id")
);

-- CreateTable
CREATE TABLE "two_factor_histories" (
    "two_factor_history_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" "two_factor_action" NOT NULL,
    "phone_number" VARCHAR(11),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_histories_pkey" PRIMARY KEY ("two_factor_history_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_user_id_device_id_hash_key" ON "trusted_devices"("user_id", "device_id_hash");

-- CreateIndex
CREATE INDEX "two_factor_histories_user_id_create_date_idx" ON "two_factor_histories"("user_id", "create_date");

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_histories" ADD CONSTRAINT "two_factor_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이미 주문한 적이 있는 회원은 주문 기능을 활성화한 것으로 본다 (첫 주문 2차 보안 재인증 대상에서 제외).
UPDATE "users" AS u
SET "order_activated_date" = first_order."create_date"
FROM (
    SELECT a."user_id", MIN(o."create_date") AS "create_date"
    FROM "orders" AS o
    JOIN "accounts" AS a ON a."account_id" = o."account_id"
    GROUP BY a."user_id"
) AS first_order
WHERE first_order."user_id" = u."user_id";
