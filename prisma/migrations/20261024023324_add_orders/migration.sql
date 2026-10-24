-- CreateEnum
CREATE TYPE "order_side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('LIMIT');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('ACCEPTED', 'PARTIAL', 'FILLED', 'CANCELED');

-- CreateTable
CREATE TABLE "orders" (
    "order_id" BIGSERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "client_order_id" UUID NOT NULL,
    "side" "order_side" NOT NULL,
    "order_type" "order_type" NOT NULL DEFAULT 'LIMIT',
    "price" BIGINT NOT NULL,
    "qty" BIGINT NOT NULL,
    "filled_qty" BIGINT NOT NULL DEFAULT 0,
    "locked_amount" BIGINT NOT NULL DEFAULT 0,
    "status" "order_status" NOT NULL DEFAULT 'ACCEPTED',
    "canceled_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateIndex
CREATE INDEX "orders_stock_id_status_side_price_create_date_idx" ON "orders"("stock_id", "status", "side", "price", "create_date");

-- CreateIndex
CREATE INDEX "orders_account_id_create_date_idx" ON "orders"("account_id", "create_date");

-- CreateIndex
CREATE UNIQUE INDEX "orders_account_id_client_order_id_key" ON "orders"("account_id", "client_order_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;
