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
  constructor(private readonly options: BrevoMailSenderOptions) {
    super();
  }

  async send(mail: Mail): Promise<void> {
    const response = await fetch(BREVO_SEND_URL, {
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

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Brevo 메일 발송 실패: ${response.status} ${body}`);
    }
  }
}
