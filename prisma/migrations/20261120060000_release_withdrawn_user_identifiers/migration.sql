BEGIN;

ALTER TABLE "users"
    ALTER COLUMN "email" DROP NOT NULL,
    ALTER COLUMN "nickname" DROP NOT NULL,
    ALTER COLUMN "birth_date" DROP NOT NULL;

-- Apply the same cleanup to accounts withdrawn before this migration.
UPDATE "users"
SET "login_id" = 'withdrawn_' || "user_id"::text,
    "is_deleted" = TRUE,
    "email" = NULL, "nickname" = NULL, "birth_date" = NULL,
    "phone_number" = NULL, "two_factor_phone_number" = NULL,
    "two_factor_status" = 'NOT_SET',
    "two_factor_enabled_date" = NULL, "two_factor_verified_date" = NULL,
    "two_factor_locked_until" = NULL, "two_factor_fail_count" = 0
WHERE "user_status" = 'WITHDRAWN';

UPDATE "two_factor_histories" AS history
SET "phone_number" = NULL
FROM "users" AS member
WHERE history."user_id" = member."user_id"
  AND member."user_status" = 'WITHDRAWN'
  AND history."phone_number" IS NOT NULL;

DELETE FROM "trusted_devices" AS device
USING "users" AS member
WHERE device."user_id" = member."user_id"
  AND member."user_status" = 'WITHDRAWN';

UPDATE "price_alerts" AS alert
SET "is_active" = FALSE, "modified_date" = CURRENT_TIMESTAMP
FROM "users" AS member
WHERE alert."user_id" = member."user_id"
  AND member."user_status" = 'WITHDRAWN'
  AND alert."is_active";

COMMIT;
