import { Logger } from '@nestjs/common';
import {
  Mail,
  MailSender,
  TrackedMailError,
  type TrackedMailResult,
} from './mail-sender.js';

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

  async send(mail: Mail): Promise<void> {
    await this.sendTracked(mail);
  }

  /** Brevo의 2xx는 발송 요청 접수다. 실제 수신함 도착을 보증하지 않는다. */
  async sendTracked(mail: Mail): Promise<TrackedMailResult> {
    let response: Response;
    try {
      response = await this.request(mail);
    } catch {
      this.logger.error('Brevo 메일 발송 결과 확인 불가');
      throw new TrackedMailError('UNKNOWN');
    }
    if (!response.ok) {
      // 타임아웃·서버 오류는 발송 여부가 불명확할 수 있다. 응답 본문에 개인정보를 남기지 않는다.
      this.logger.error(`Brevo 메일 발송 실패: HTTP ${response.status}`);
      throw new TrackedMailError(
        response.status >= 500 || response.status === 408
          ? 'UNKNOWN'
          : 'FAILED',
      );
    }
    const body: unknown = await response.json().catch(() => null);
    const id =
      body && typeof body === 'object' && 'messageId' in body
        ? body.messageId
        : null;
    return {
      mode: 'BREVO',
      messageId: typeof id === 'string' ? id.slice(0, 255) : null,
    };
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
