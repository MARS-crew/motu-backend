-- CreateEnum
CREATE TYPE "trade_status" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CLOSED');

-- CreateTable
CREATE TABLE "sectors" (
    "sector_code" INTEGER NOT NULL,
    "sector_name" VARCHAR(30) NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("sector_code")
);

-- CreateTable
CREATE TABLE "stocks" (
    "stock_id" SERIAL NOT NULL,
    "stock_code" VARCHAR(20) NOT NULL,
    "sector_code" INTEGER NOT NULL,
    "stock_name" VARCHAR(30) NOT NULL,
    "summary" VARCHAR(60) NOT NULL,
    "description" VARCHAR(500),
    "logo_image_url" VARCHAR(500),
    "main_image_url" VARCHAR(500) NOT NULL,
    "official_url" VARCHAR(500),
    "operator_name" VARCHAR(50) NOT NULL,
    "listed_shares" BIGINT NOT NULL,
    "base_price" BIGINT NOT NULL,
    "listing_date" TIMESTAMPTZ(3) NOT NULL,
    "trade_status" "trade_status" NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("stock_id")
);

-- CreateTable
CREATE TABLE "search_histories" (
    "search_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "keyword" VARCHAR(50) NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "search_histories_pkey" PRIMARY KEY ("search_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sectors_sector_name_key" ON "sectors"("sector_name");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_stock_code_key" ON "stocks"("stock_code");

-- CreateIndex
CREATE INDEX "stocks_sector_code_idx" ON "stocks"("sector_code");

-- CreateIndex
CREATE INDEX "stocks_listing_date_idx" ON "stocks"("listing_date");

-- CreateIndex
CREATE INDEX "search_histories_user_id_modified_date_idx" ON "search_histories"("user_id", "modified_date");

-- CreateIndex
CREATE UNIQUE INDEX "search_histories_user_id_keyword_key" ON "search_histories"("user_id", "keyword");

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_sector_code_fkey" FOREIGN KEY ("sector_code") REFERENCES "sectors"("sector_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_histories" ADD CONSTRAINT "search_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
