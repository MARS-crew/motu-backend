import { Global, Module } from '@nestjs/common';
import { ConsoleMailSender } from './console-mail-sender.js';
import { MailSender } from './mail-sender.js';

@Global()
@Module({
  providers: [{ provide: MailSender, useClass: ConsoleMailSender }],
  exports: [MailSender],
})
export class MailModule {}
