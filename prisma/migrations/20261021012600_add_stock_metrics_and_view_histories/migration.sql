-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "dau" BIGINT,
ADD COLUMN     "mau" BIGINT,
ADD COLUMN     "metrics_end_date" DATE,
ADD COLUMN     "metrics_start_date" DATE,
ADD COLUMN     "revenue" BIGINT,
ADD COLUMN     "transaction_volume" BIGINT;

-- CreateTable
CREATE TABLE "view_histories" (
    "user_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "view_histories_pkey" PRIMARY KEY ("user_id","stock_id")
);

-- CreateIndex
CREATE INDEX "view_histories_user_id_modified_date_idx" ON "view_histories"("user_id", "modified_date");

-- AddForeignKey
ALTER TABLE "view_histories" ADD CONSTRAINT "view_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "view_histories" ADD CONSTRAINT "view_histories_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;
