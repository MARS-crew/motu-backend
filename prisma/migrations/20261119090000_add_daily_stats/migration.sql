-- CreateTable
CREATE TABLE "daily_stats" (
    "stat_date" DATE NOT NULL,
    "trade_volume" BIGINT NOT NULL,
    "trade_amount" BIGINT NOT NULL,
    "listed_stock_count" INTEGER,
    "pending_listing_count" INTEGER,
    "pending_inquiry_count" INTEGER,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("stat_date")
);
