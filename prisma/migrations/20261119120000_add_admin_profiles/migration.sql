-- CreateTable
CREATE TABLE "admin_profiles" (
    "user_id" INTEGER NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "duty" VARCHAR(50),
    "password_change_required" BOOLEAN NOT NULL DEFAULT true,
    "create_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_date" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
