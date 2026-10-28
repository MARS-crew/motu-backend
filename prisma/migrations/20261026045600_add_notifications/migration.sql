-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('ORDER', 'PRICE', 'LISTING_DRAFT_EXPIRING');

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "notification_type" "notification_type" NOT NULL,
    "event_key" VARCHAR(200) NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "payload" JSONB NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(3),
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_create_date_notification_id_idx" ON "notifications"("user_id", "create_date", "notification_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_notification_type_event_key_key" ON "notifications"("user_id", "notification_type", "event_key");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
