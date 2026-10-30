const MINUTE_MS = 60 * 1000;

/** SMS 재인증 성공 후 같은 작업에서 다시 묻지 않는 시간 */
export const TWO_FACTOR_VERIFIED_TTL_MS = 10 * MINUTE_MS;
/** 이 횟수만큼 연속으로 인증번호를 틀리면 2차 보안 인증을 제한한다. */
export const MAX_TWO_FACTOR_FAIL_COUNT = 5;
export const TWO_FACTOR_LOCK_MS = 30 * MINUTE_MS;
/** 새 기기 확인을 통과한 기기를 마지막 사용 후 신뢰하는 기간 */
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * MINUTE_MS;

/** 2차 보안 재인증이 필요한 작업. 403 TWO_FACTOR_REQUIRED의 details.action으로 내려준다. */
export enum TwoFactorAction {
  /** 2차 보안 설정 계정의 첫 주문 */
  ORDER_ACTIVATION = 'ORDER_ACTIVATION',
  /** 등록 휴대폰 변경 */
  PHONE_CHANGE = 'PHONE_CHANGE',
  /** 상장 신청 최종 제출 */
  LISTING_SUBMIT = 'LISTING_SUBMIT',
}

/** 새 기기 로그인 확인 수단 */
export enum LoginVerificationMethod {
  /** 2차 보안 미설정 계정: 가입 이메일 */
  EMAIL = 'EMAIL',
  /** 2차 보안 설정 계정: 등록 휴대폰 SMS */
  SMS = 'SMS',
}
