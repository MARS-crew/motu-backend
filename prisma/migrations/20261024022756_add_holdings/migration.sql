-- CreateTable
CREATE TABLE "holdings" (
    "holding_id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "qty" BIGINT NOT NULL,
    "locked_qty" BIGINT NOT NULL DEFAULT 0,
    "total_amount" BIGINT NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("holding_id")
);

-- CreateIndex
CREATE INDEX "holdings_stock_id_idx" ON "holdings"("stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "holdings_account_id_stock_id_key" ON "holdings"("account_id", "stock_id");

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;
