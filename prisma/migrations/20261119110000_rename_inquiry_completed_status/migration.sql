-- 문의 처리 완료의 이름만 변경한다. 기존 문의 행·참조 관계는 유지한다.
-- 기존 활동 이력의 JSON 스냅샷은 당시 기록이므로 변경하지 않는다.
ALTER TYPE "inquiry_status" RENAME VALUE 'APPROVED' TO 'COMPLETED';
