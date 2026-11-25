-- 신규 가입 지급 설정은 단일 행으로 보존한다. 리셋·기존 회원·기존 원장은 수정하지 않는다.
CREATE TABLE "initial_point_settings" (
  "setting_id" INTEGER NOT NULL DEFAULT 1,
  "amount" BIGINT NOT NULL DEFAULT 3000000,
  "version" INTEGER NOT NULL DEFAULT 1,
  "modified_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "initial_point_settings_pkey" PRIMARY KEY ("setting_id"),
  CONSTRAINT "initial_point_settings_singleton" CHECK ("setting_id" = 1),
  CONSTRAINT "initial_point_settings_amount_range" CHECK ("amount" BETWEEN 1 AND 9007199254740991),
  CONSTRAINT "initial_point_settings_version_positive" CHECK ("version" >= 1)
);
INSERT INTO "initial_point_settings" ("setting_id") VALUES (1);

ALTER TYPE "admin_activity_target" ADD VALUE 'POINT_SETTING';
ALTER TYPE "admin_activity_action" ADD VALUE 'INITIAL_GRANT_UPDATE';
