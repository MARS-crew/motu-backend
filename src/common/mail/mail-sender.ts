export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * 메일 발송 인터페이스. 발송 서비스(SMTP, Resend 등)가 정해지면 구현체를 추가하고 MailModule에서 교체한다.
 */
export abstract class MailSender {
  abstract send(mail: Mail): Promise<void>;
}
