import { Logger } from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception.js';
import { SmsErrors } from './sms.errors.js';
import { Sms, SmsSender } from './sms-sender.js';

const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/send';
const REQUEST_TIMEOUT_MS = 10_000;

export interface BrevoSmsSenderOptions {
  apiKey: string;
  /** 발신자 이름. 영문·숫자 11자 이하 (국내 통신사는 임의 번호로 바꿔 보낸다) */
  sender: string;
}

/**
 * Brevo HTTPS API로 인증용(transactional) SMS를 보낸다.
 * https://developers.brevo.com/reference/send-async-transactional-sms
 */
export class BrevoSmsSender extends SmsSender {
  private readonly logger = new Logger(BrevoSmsSender.name);

  constructor(private readonly options: BrevoSmsSenderOptions) {
    super();
  }

  /** 발송하지 못하면 원인은 로그에 남기고 503 SMS_SEND_FAILED로 알린다. */
  async send(sms: Sms): Promise<void> {
    let response: Response;
    try {
      response = await this.request(sms);
    } catch (error) {
      this.logger.error(
        'Brevo SMS 발송 요청 실패',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BusinessException(SmsErrors.SEND_FAILED);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Brevo SMS 발송 실패: ${response.status} ${body}`);
      throw new BusinessException(SmsErrors.SEND_FAILED);
    }
  }

  private request(sms: Sms): Promise<Response> {
    return fetch(BREVO_SMS_URL, {
      method: 'POST',
      headers: {
        'api-key': this.options.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: this.options.sender,
        recipient: toInternational(sms.to),
        content: sms.text,
        type: 'transactional',
        unicodeEnabled: true,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}

/** 01012345678 → 821012345678 (국가번호 82, 앞자리 0 제거) */
export function toInternational(phoneNumber: string): string {
  return `82${phoneNumber.slice(1)}`;
}
