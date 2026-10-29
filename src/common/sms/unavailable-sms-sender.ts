import { Injectable } from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception.js';
import { SmsErrors } from './sms.errors.js';
import { SmsSender } from './sms-sender.js';

/**
 * 운영 환경에서 SMS 발송 설정이 없을 때 쓴다. 인증번호가 서버 로그에 남지 않도록 출력하지 않고 503으로 알린다.
 */
@Injectable()
export class UnavailableSmsSender extends SmsSender {
  send(): Promise<void> {
    return Promise.reject(new BusinessException(SmsErrors.SEND_FAILED));
  }
}
