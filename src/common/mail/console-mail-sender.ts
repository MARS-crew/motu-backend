import { Injectable, Logger } from '@nestjs/common';
import { Mail, MailSender } from './mail-sender.js';

/**
 * 메일을 실제로 보내지 않고 서버 로그에 출력한다. 개발용이며 운영 배포 전 실제 구현체로 교체해야 한다.
 */
@Injectable()
export class ConsoleMailSender extends MailSender {
  private readonly logger = new Logger(ConsoleMailSender.name);

  send(mail: Mail): Promise<void> {
    this.logger.log(
      `[메일] to=${mail.to} subject=${mail.subject}\n${mail.text}`,
    );
    return Promise.resolve();
  }
}
