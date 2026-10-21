-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "cash_ledger_type" ADD VALUE 'GRANT';
ALTER TYPE "cash_ledger_type" ADD VALUE 'RESET';
ALTER TYPE "cash_ledger_type" ADD VALUE 'ADJUST';

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "last_point_grant_at" TIMESTAMPTZ(3),
ADD COLUMN     "last_point_reset_at" TIMESTAMPTZ(3);
