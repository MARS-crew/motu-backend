-- AlterTable
ALTER TABLE "verifications" ADD COLUMN     "code_cipher" VARCHAR(255),
ADD COLUMN     "sent_at" TIMESTAMPTZ(3);
