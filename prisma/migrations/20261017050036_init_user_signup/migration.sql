-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'LOCKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "cash_ledger_type" AS ENUM ('DEPOSIT', 'BUY', 'SELL');

-- CreateEnum
CREATE TYPE "verification_channel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "verification_purpose" AS ENUM ('SIGNUP');

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "login_id" VARCHAR(20) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(11),
    "nickname" VARCHAR(10) NOT NULL,
    "birth_date" DATE NOT NULL,
    "terms_agreed" BOOLEAN NOT NULL,
    "privacy_agreed" BOOLEAN NOT NULL,
    "marketing_agreed" BOOLEAN NOT NULL,
    "night_push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "user_status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "role" "role" NOT NULL DEFAULT 'USER',
    "login_fail_count" INTEGER NOT NULL DEFAULT 0,
    "last_login_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "account_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "cash" BIGINT NOT NULL,
    "locked_cash" BIGINT NOT NULL DEFAULT 0,
    "version" BIGINT NOT NULL DEFAULT 0,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "cash_ledgers" (
    "ledger_id" BIGSERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "type" "cash_ledger_type" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_ledgers_pkey" PRIMARY KEY ("ledger_id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "verification_id" SERIAL NOT NULL,
    "channel" "verification_channel" NOT NULL,
    "purpose" "verification_purpose" NOT NULL,
    "target" VARCHAR(255) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("verification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_nickname_key" ON "users"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_key" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "cash_ledgers_account_id_create_date_idx" ON "cash_ledgers"("account_id", "create_date");

-- CreateIndex
CREATE INDEX "verifications_channel_purpose_target_create_date_idx" ON "verifications"("channel", "purpose", "target", "create_date");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_ledgers" ADD CONSTRAINT "cash_ledgers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
