ALTER TABLE "stocks"
  ADD COLUMN "listing_blocked_at" TIMESTAMPTZ(3),
  ADD COLUMN "listing_blocked_reason" VARCHAR(255);
