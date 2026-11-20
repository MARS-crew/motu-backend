-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deleted_date" TIMESTAMPTZ(3),
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reason" VARCHAR(50);
