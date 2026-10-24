-- AlterTable
ALTER TABLE "cash_ledgers" ADD COLUMN     "fee" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "realized_pnl" BIGINT,
ADD COLUMN     "trade_id" BIGINT;

-- CreateIndex
CREATE INDEX "cash_ledgers_trade_id_idx" ON "cash_ledgers"("trade_id");

-- AddForeignKey
ALTER TABLE "cash_ledgers" ADD CONSTRAINT "cash_ledgers_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("trade_id") ON DELETE RESTRICT ON UPDATE CASCADE;
