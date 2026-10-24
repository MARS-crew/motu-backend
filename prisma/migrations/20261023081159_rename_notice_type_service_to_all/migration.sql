-- 공지 구분 값을 ERD(TB_NOTICE.notice_type)에 맞춰 SERVICE에서 ALL로 바꾼다.
ALTER TYPE "notice_type" RENAME VALUE 'SERVICE' TO 'ALL';
