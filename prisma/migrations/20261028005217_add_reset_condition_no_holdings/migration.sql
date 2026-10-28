-- AlterEnum
-- 화면 순서상 첫 번째 조건이라 기존 값 앞에 둔다.
ALTER TYPE "point_reset_condition" ADD VALUE 'NO_HOLDINGS' BEFORE 'NO_LOCKED_CASH';
