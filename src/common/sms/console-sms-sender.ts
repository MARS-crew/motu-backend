import { Injectable, Logger } from '@nestjs/common';
import { Sms, SmsSender } from './sms-sender.js';

/**
 * SMS를 실제로 보내지 않고 서버 로그에 출력한다. SMS 발송 설정이 없는 로컬·테스트 환경에서 쓴다.
 */
@Injectable()
export class ConsoleSmsSender extends SmsSender {
  private readonly logger = new Logger(ConsoleSmsSender.name);

  send(sms: Sms): Promise<void> {
    this.logger.log(`[SMS] to=${sms.to}\n${sms.text}`);
    return Promise.resolve();
  }
}
