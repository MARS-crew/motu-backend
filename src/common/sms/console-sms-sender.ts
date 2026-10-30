import { Injectable, Logger } from '@nestjs/common';
import { Sms, SmsSender } from './sms-sender.js';

/**
 * SMS를 실제로 보내지 않고 서버 로그에 출력한다. SMS_SENDER가 없을 때 쓴다 (로컬, 발송 전 운영).
 */
@Injectable()
export class ConsoleSmsSender extends SmsSender {
  private readonly logger = new Logger(ConsoleSmsSender.name);

  send(sms: Sms): Promise<void> {
    this.logger.log(`[SMS] to=${sms.to}\n${sms.text}`);
    return Promise.resolve();
  }
}
