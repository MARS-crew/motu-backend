-- AlterTable
ALTER TABLE "attachment_collections" ADD COLUMN     "frozen_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "listing_application_revisions" (
    "revision_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "requested_by_id" INTEGER NOT NULL,
    "request_content" VARCHAR(2000) NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "deadline_history" JSONB NOT NULL DEFAULT '[]',
    "previous_data" JSONB NOT NULL,
    "resubmitted_at" TIMESTAMPTZ(3),
    "evidence_collection_id" UUID,
    "evidence_snapshot" JSONB,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "listing_application_revisions_pkey" PRIMARY KEY ("revision_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_application_revisions_evidence_collection_id_key" ON "listing_application_revisions"("evidence_collection_id");

-- CreateIndex
CREATE INDEX "listing_application_revisions_application_id_revision_id_idx" ON "listing_application_revisions"("application_id", "revision_id");

-- AddForeignKey
ALTER TABLE "listing_application_revisions" ADD CONSTRAINT "listing_application_revisions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "listing_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_application_revisions" ADD CONSTRAINT "listing_application_revisions_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_application_revisions" ADD CONSTRAINT "listing_application_revisions_evidence_collection_id_fkey" FOREIGN KEY ("evidence_collection_id") REFERENCES "attachment_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 한 신청서에 아직 재제출하지 않은 보완 요청은 하나만 허용한다.
CREATE UNIQUE INDEX "listing_application_revisions_open_key"
ON "listing_application_revisions"("application_id") WHERE "resubmitted_at" IS NULL;

ALTER TABLE "listing_application_revisions" ADD CONSTRAINT "listing_revisions_evidence_complete"
CHECK (("resubmitted_at" IS NULL AND "evidence_collection_id" IS NULL AND "evidence_snapshot" IS NULL)
    OR ("resubmitted_at" IS NOT NULL AND "evidence_collection_id" IS NOT NULL AND "evidence_snapshot" IS NOT NULL));
