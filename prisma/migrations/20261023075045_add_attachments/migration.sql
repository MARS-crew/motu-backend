-- CreateEnum
CREATE TYPE "attachment_purpose" AS ENUM ('EVIDENCE', 'LOGO', 'MAIN_IMAGE');

-- CreateEnum
CREATE TYPE "attachment_kind" AS ENUM ('FILE', 'LINK');

-- CreateTable
CREATE TABLE "attachment_collections" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "purpose" "attachment_purpose" NOT NULL,
    "description" VARCHAR(500),
    "saved_at" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "kind" "attachment_kind" NOT NULL,
    "original_name" VARCHAR(255),
    "content_type" VARCHAR(100),
    "size" INTEGER,
    "object_key" VARCHAR(500),
    "url" VARCHAR(2048),
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachment_collections_user_id_idx" ON "attachment_collections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_object_key_key" ON "attachments"("object_key");

-- CreateIndex
CREATE INDEX "attachments_collection_id_idx" ON "attachments"("collection_id");

-- AddForeignKey
ALTER TABLE "attachment_collections" ADD CONSTRAINT "attachment_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "attachment_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
