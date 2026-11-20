import { BusinessException } from '../exceptions/business.exception.js';
import { MailErrors } from './mail.errors.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface TrackedMailResult {
  mode: 'BREVO' | 'CONSOLE';
  messageId: string | null;
}
/** 발송 거절과 실제 발송 여부가 불명확한 오류를 구분한다. */
export class TrackedMailError extends BusinessException {
  constructor(readonly outcome: 'FAILED' | 'UNKNOWN') {
    super(MailErrors.SEND_FAILED);
  }
}
/** 기존 인증 메일은 send를 사용하고, 문의 답변은 결과 추적이 가능한 sendTracked를 사용한다. */
export abstract class MailSender {
  abstract send(mail: Mail): Promise<void>;
  sendTracked(_mail: Mail): Promise<TrackedMailResult> {
    // 추적 기능을 구현하지 않은 발송기를 성공으로 간주하지 않는다.
    return Promise.reject(new TrackedMailError('FAILED'));
  }
}
