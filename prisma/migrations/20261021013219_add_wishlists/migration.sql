-- CreateTable
CREATE TABLE "wishlists" (
    "user_id" INTEGER NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wishlists_pkey" PRIMARY KEY ("user_id","stock_id")
);

-- CreateIndex
CREATE INDEX "wishlists_user_id_create_date_idx" ON "wishlists"("user_id", "create_date");

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;
