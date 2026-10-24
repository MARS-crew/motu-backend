-- CreateEnum
CREATE TYPE "chart_interval" AS ENUM ('MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH');

-- CreateTable
CREATE TABLE "charts" (
    "stock_id" INTEGER NOT NULL,
    "candle_interval" "chart_interval" NOT NULL,
    "candle_time" TIMESTAMPTZ(3) NOT NULL,
    "open_price" BIGINT NOT NULL,
    "high_price" BIGINT NOT NULL,
    "low_price" BIGINT NOT NULL,
    "close_price" BIGINT NOT NULL,
    "volume" BIGINT NOT NULL,
    "trade_amount" BIGINT NOT NULL,

    CONSTRAINT "charts_pkey" PRIMARY KEY ("stock_id","candle_interval","candle_time")
);

-- AddForeignKey
ALTER TABLE "charts" ADD CONSTRAINT "charts_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;
