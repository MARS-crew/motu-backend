/** 공지 목록 한 페이지 기본 건수 (화면설계서 기준 10개) */
export const NOTICE_PAGE_SIZE = 10;
export const MAX_PINNED_NOTICES = 3;
export const NOTICE_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
export const NOTICE_DATE_MESSAGE =
  '게시 일시는 시간대를 포함한 ISO 일시로 입력해 주세요.';
