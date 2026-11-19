-- CreateEnum
CREATE TYPE "anomaly_type" AS ENUM ('LARGE_ORDER', 'REPEATED_ORDER', 'ABNORMAL_PRICE', 'ORDER_FAILURE', 'BALANCE_MISMATCH');

-- CreateEnum
CREATE TYPE "anomaly_status" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "anomaly_action" AS ENUM ('STOCK_PAUSE', 'USER_BLOCK', 'NO_ISSUE');

-- CreateTable
CREATE TABLE "anomalies" (
    "anomaly_id" SERIAL NOT NULL,
    "anomaly_type" "anomaly_type" NOT NULL,
    "status" "anomaly_status" NOT NULL DEFAULT 'PENDING',
    "stock_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "order_id" BIGINT,
    "trade_id" BIGINT,
    "error_code" VARCHAR(50) NOT NULL,
    "error_message" VARCHAR(200) NOT NULL,
    "evidence" JSONB NOT NULL,
    "detected_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "anomaly_action",
    "action_reason" VARCHAR(200),
    "handled_by" INTEGER,
    "handled_date" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("anomaly_id")
);

-- CreateIndex
CREATE INDEX "anomalies_detected_date_idx" ON "anomalies"("detected_date");

-- CreateIndex
CREATE INDEX "anomalies_status_detected_date_idx" ON "anomalies"("status", "detected_date");

-- CreateIndex
CREATE INDEX "anomalies_user_id_anomaly_type_detected_date_idx" ON "anomalies"("user_id", "anomaly_type", "detected_date");

-- CreateIndex
CREATE UNIQUE INDEX "anomalies_anomaly_type_trade_id_key" ON "anomalies"("anomaly_type", "trade_id");

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("trade_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

