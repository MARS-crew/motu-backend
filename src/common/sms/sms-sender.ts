export interface Sms {
  /** 국내 휴대폰 번호 (숫자만, 01012345678) */
  to: string;
  text: string;
}

/**
 * SMS 발송 인터페이스. 구현체는 SmsModule에서 환경 변수에 따라 고른다.
 */
export abstract class SmsSender {
  abstract send(sms: Sms): Promise<void>;
}
