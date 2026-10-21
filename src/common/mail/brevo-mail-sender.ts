import { Logger } from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception.js';
import { MailErrors } from './mail.errors.js';
import { Mail, MailSender } from './mail-sender.js';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const REQUEST_TIMEOUT_MS = 10_000;

export interface BrevoMailSenderOptions {
  apiKey: string;
  fromEmail: string;
  fromName: string;
}

/**
 * Brevo HTTPS API로 메일을 보낸다. Railway는 SMTP 포트를 막기 때문에 SMTP 대신 API를 쓴다.
 * https://developers.brevo.com/reference/sendtransacemail
 */
export class BrevoMailSender extends MailSender {
  private readonly logger = new Logger(BrevoMailSender.name);

  constructor(private readonly options: BrevoMailSenderOptions) {
    super();
  }

  /** 발송하지 못하면 원인은 로그에 남기고 503 MAIL_SEND_FAILED로 알린다. */
  async send(mail: Mail): Promise<void> {
    let response: Response;
    try {
      response = await this.request(mail);
    } catch (error) {
      this.logger.error(
        'Brevo 메일 발송 요청 실패',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BusinessException(MailErrors.SEND_FAILED);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Brevo 메일 발송 실패: ${response.status} ${body}`);
      throw new BusinessException(MailErrors.SEND_FAILED);
    }
  }

  private request(mail: Mail): Promise<Response> {
    return fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': this.options.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: this.options.fromEmail, name: this.options.fromName },
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}
