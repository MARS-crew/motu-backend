ALTER TYPE "inquiry_type" ADD VALUE 'PHONE_UNAVAILABLE';
ALTER TYPE "admin_activity_target" ADD VALUE 'INQUIRY';
ALTER TYPE "admin_activity_action" ADD VALUE 'INQUIRY_START';
ALTER TYPE "admin_activity_action" ADD VALUE 'INQUIRY_REPLY_DRAFT_SAVE';
ALTER TYPE "admin_activity_action" ADD VALUE 'INQUIRY_REPLY_SEND';
CREATE TYPE "inquiry_reply_status" AS ENUM ('SENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN', 'SIMULATED');
ALTER TABLE "inquiries" ADD COLUMN "reply_email" VARCHAR(255), ADD COLUMN "assigned_admin_id" INTEGER,
 ADD COLUMN "processing_started_at" TIMESTAMPTZ(3), ADD COLUMN "reply_draft" VARCHAR(5000),
 ADD COLUMN "reply_version" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "completed_at" TIMESTAMPTZ(3), ADD COLUMN "active_reply_attempt_id" UUID;
UPDATE "inquiries" i SET "reply_email"=u."email" FROM "users" u WHERE i."user_id"=u."user_id";
CREATE TABLE "inquiry_reply_attempts" (
 "id" UUID NOT NULL, "inquiry_id" INTEGER NOT NULL, "request_id" UUID NOT NULL, "admin_id" INTEGER NOT NULL,
 "draft_version" INTEGER NOT NULL, "to_email" VARCHAR(255) NOT NULL, "reply_text" VARCHAR(5000) NOT NULL,
 "status" "inquiry_reply_status" NOT NULL DEFAULT 'SENDING', "delivery_mode" VARCHAR(20), "provider_message_id" VARCHAR(255),
 "error_code" VARCHAR(80), "retry_reason" VARCHAR(200), "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finished_at" TIMESTAMPTZ(3), "finalized_at" TIMESTAMPTZ(3), CONSTRAINT "inquiry_reply_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inquiry_reply_attempts_inquiry_id_request_id_key" ON "inquiry_reply_attempts"("inquiry_id","request_id");
CREATE INDEX "inquiry_reply_attempts_inquiry_id_create_date_id_idx" ON "inquiry_reply_attempts"("inquiry_id","create_date","id");
CREATE UNIQUE INDEX "inquiries_active_reply_attempt_id_key" ON "inquiries"("active_reply_attempt_id");
CREATE INDEX "inquiries_inquiry_status_create_date_inquiry_id_idx" ON "inquiries"("inquiry_status","create_date","inquiry_id");
CREATE INDEX "inquiries_inquiry_type_create_date_inquiry_id_idx" ON "inquiries"("inquiry_type","create_date","inquiry_id");
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiry_reply_attempts" ADD CONSTRAINT "inquiry_reply_attempts_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("inquiry_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiry_reply_attempts" ADD CONSTRAINT "inquiry_reply_attempts_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_active_reply_attempt_id_fkey" FOREIGN KEY ("active_reply_attempt_id") REFERENCES "inquiry_reply_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
