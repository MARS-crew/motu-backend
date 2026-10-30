/** Refresh 토큰 원문 길이 (바이트). base64url로 인코딩해 내려준다. */
export const REFRESH_TOKEN_BYTES = 32;

/** 비밀번호 재설정 링크 유효시간 */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** 같은 계정으로 재설정 메일을 다시 보낼 수 있는 간격 */
export const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

/** 새 기기 확인용 로그인 토큰 유효시간 (초). 이 안에 인증번호 확인까지 마쳐야 한다. */
export const LOGIN_TOKEN_TTL = 10 * 60;
