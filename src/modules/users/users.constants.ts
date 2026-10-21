export const LOGIN_ID_PATTERN = /^[a-z0-9]{5,20}$/;
export const LOGIN_ID_MESSAGE =
  '아이디는 5~20자의 영문 소문자와 숫자로 입력해 주세요.';

export const PASSWORD_PATTERN =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s])[^\s]{8,20}$/;
export const PASSWORD_MESSAGE =
  '비밀번호는 8~20자로 영문·숫자·특수문자를 각각 1개 이상 포함해야 합니다.';

export const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]{2,10}$/;
export const NICKNAME_MESSAGE =
  '닉네임은 2~10자의 한글·영문·숫자로 입력해 주세요.';

/** 오늘 날짜(한국 시간, YYYY-MM-DD) */
export const todayInKorea = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
    new Date(),
  );

/** 이메일은 앞뒤 공백을 지우고 소문자로 저장한다. */
export const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** 비밀번호를 이 횟수만큼 연속으로 틀리면 계정을 잠근다. */
export const MAX_LOGIN_FAIL_COUNT = 5;
