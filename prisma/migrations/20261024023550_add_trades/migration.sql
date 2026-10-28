-- CreateTable
CREATE TABLE "trades" (
    "trade_id" BIGSERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "buy_order_id" BIGINT NOT NULL,
    "sell_order_id" BIGINT NOT NULL,
    "price" BIGINT NOT NULL,
    "qty" BIGINT NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("trade_id")
);

-- CreateIndex
CREATE INDEX "trades_stock_id_create_date_idx" ON "trades"("stock_id", "create_date");

-- CreateIndex
CREATE INDEX "trades_buy_order_id_idx" ON "trades"("buy_order_id");

-- CreateIndex
CREATE INDEX "trades_sell_order_id_idx" ON "trades"("sell_order_id");

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_buy_order_id_fkey" FOREIGN KEY ("buy_order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_sell_order_id_fkey" FOREIGN KEY ("sell_order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;
