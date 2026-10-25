-- AlterTable
ALTER TABLE "listing_applications" ADD COLUMN     "review_comment" TEXT,
ADD COLUMN     "revision_deadline" TIMESTAMPTZ(3),
ADD COLUMN     "submitted_at" TIMESTAMPTZ(3);
