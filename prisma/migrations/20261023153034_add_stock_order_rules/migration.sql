-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "min_order_price" BIGINT NOT NULL DEFAULT 1,
ADD COLUMN     "min_order_qty" BIGINT NOT NULL DEFAULT 1,
ADD COLUMN     "price_tick_size" BIGINT NOT NULL DEFAULT 1;

ALTER TABLE "stocks" ALTER COLUMN "min_order_price" DROP DEFAULT,
ALTER COLUMN "min_order_qty" DROP DEFAULT,
ALTER COLUMN "price_tick_size" DROP DEFAULT;
