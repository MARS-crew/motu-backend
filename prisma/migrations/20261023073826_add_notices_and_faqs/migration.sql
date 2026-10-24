-- CreateEnum
CREATE TYPE "notice_type" AS ENUM ('SERVICE', 'STOCK');

-- CreateEnum
CREATE TYPE "faq_category" AS ENUM ('TRADE', 'POINT', 'ACCOUNT', 'LISTING', 'ETC');

-- CreateTable
CREATE TABLE "notices" (
    "notice_id" SERIAL NOT NULL,
    "notice_type" "notice_type" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "post_start_date" TIMESTAMPTZ(3) NOT NULL,
    "post_end_date" TIMESTAMPTZ(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("notice_id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "faq_id" SERIAL NOT NULL,
    "category" "faq_category" NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "answer" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("faq_id")
);

-- CreateIndex
CREATE INDEX "notices_post_start_date_idx" ON "notices"("post_start_date");

-- CreateIndex
CREATE INDEX "faqs_category_sort_order_idx" ON "faqs"("category", "sort_order");

