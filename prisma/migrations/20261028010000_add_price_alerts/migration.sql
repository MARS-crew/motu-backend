-- CreateTable
CREATE TABLE "price_alerts" (
    "alert_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "target_price" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" BIGINT NOT NULL DEFAULT 0,
    "triggered_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("alert_id")
);

-- CreateIndex
CREATE INDEX "price_alerts_user_id_alert_id_idx" ON "price_alerts"("user_id", "alert_id");

-- CreateIndex
CREATE INDEX "price_alerts_stock_id_is_active_target_price_idx" ON "price_alerts"("stock_id", "is_active", "target_price");

-- CreateIndex
CREATE UNIQUE INDEX "price_alerts_user_id_stock_id_target_price_key" ON "price_alerts"("user_id", "stock_id", "target_price");

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;
