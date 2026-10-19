import { Injectable, Logger } from '@nestjs/common';
import { Mail, MailSender } from './mail-sender.js';

/**
 * 메일을 실제로 보내지 않고 서버 로그에 출력한다. BREVO_API_KEY가 없는 로컬·테스트 환경에서 쓴다.
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
