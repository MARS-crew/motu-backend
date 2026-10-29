-- CreateEnum
CREATE TYPE "inquiry_type" AS ENUM ('LOGIN_FAILED_LOCKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "inquiry_status" AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'APPROVED');

-- CreateTable
CREATE TABLE "inquiries" (
    "inquiry_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "inquiry_code" VARCHAR(32) NOT NULL,
    "inquiry_type" "inquiry_type" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "inquiry_status" "inquiry_status" NOT NULL DEFAULT 'SUBMITTED',
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("inquiry_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inquiries_inquiry_code_key" ON "inquiries"("inquiry_code");

-- CreateIndex
CREATE INDEX "inquiries_user_id_create_date_inquiry_id_idx" ON "inquiries"("user_id", "create_date", "inquiry_id");

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

