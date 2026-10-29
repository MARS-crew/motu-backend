-- 기존 값을 자르지 않는다. 초과 데이터가 있다면 배포를 중단하고 확인한다.
BEGIN;
ALTER TABLE "inquiries" ALTER COLUMN "content" TYPE VARCHAR(5000);
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_title_not_empty" CHECK (char_length("title") >= 1);
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_content_not_empty" CHECK (char_length("content") >= 1);

CREATE TABLE "inquiry_access_attempts" (
    "user_id" INTEGER NOT NULL,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "blocked_until" TIMESTAMPTZ(3),
    CONSTRAINT "inquiry_access_attempts_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "inquiry_access_attempts_fail_count_check" CHECK ("fail_count" BETWEEN 0 AND 5),
    CONSTRAINT "inquiry_access_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
COMMIT;
