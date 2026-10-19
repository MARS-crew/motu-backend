export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * 메일 발송 인터페이스. 구현체는 MailModule에서 환경 변수에 따라 고른다.
 */
export abstract class MailSender {
  abstract send(mail: Mail): Promise<void>;
}
