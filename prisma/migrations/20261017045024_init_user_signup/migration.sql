-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CashLedgerType" AS ENUM ('DEPOSIT', 'BUY', 'SELL');

-- CreateEnum
CREATE TYPE "VerificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('SIGNUP');

-- CreateTable
CREATE TABLE "TB_USER" (
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
    "user_status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "Role" NOT NULL DEFAULT 'USER',
    "login_fail_count" INTEGER NOT NULL DEFAULT 0,
    "last_login_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TB_USER_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "TB_ACCOUNT" (
    "account_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "cash" BIGINT NOT NULL,
    "locked_cash" BIGINT NOT NULL DEFAULT 0,
    "version" BIGINT NOT NULL DEFAULT 0,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TB_ACCOUNT_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "TB_CASH_LEDGER" (
    "ledger_id" BIGSERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "type" "CashLedgerType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TB_CASH_LEDGER_pkey" PRIMARY KEY ("ledger_id")
);

-- CreateTable
CREATE TABLE "TB_VERIFICATION" (
    "verification_id" SERIAL NOT NULL,
    "channel" "VerificationChannel" NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "target" VARCHAR(255) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TB_VERIFICATION_pkey" PRIMARY KEY ("verification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TB_USER_login_id_key" ON "TB_USER"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "TB_USER_email_key" ON "TB_USER"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TB_USER_nickname_key" ON "TB_USER"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "TB_ACCOUNT_user_id_key" ON "TB_ACCOUNT"("user_id");

-- CreateIndex
CREATE INDEX "TB_CASH_LEDGER_account_id_create_date_idx" ON "TB_CASH_LEDGER"("account_id", "create_date");

-- CreateIndex
CREATE INDEX "TB_VERIFICATION_channel_purpose_target_create_date_idx" ON "TB_VERIFICATION"("channel", "purpose", "target", "create_date");

-- AddForeignKey
ALTER TABLE "TB_ACCOUNT" ADD CONSTRAINT "TB_ACCOUNT_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "TB_USER"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TB_CASH_LEDGER" ADD CONSTRAINT "TB_CASH_LEDGER_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "TB_ACCOUNT"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
