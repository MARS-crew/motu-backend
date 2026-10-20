import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { BrevoMailSender } from './brevo-mail-sender.js';
import { ConsoleMailSender } from './console-mail-sender.js';
import { MailSender } from './mail-sender.js';

/**
 * BREVO_API_KEY가 있으면 Brevo로 보내고, 없으면 서버 로그에 출력한다.
 */
function createMailSender(
  config: ConfigService<EnvironmentVariables, true>,
): MailSender {
  const apiKey = config.get('BREVO_API_KEY', { infer: true });
  if (!apiKey) {
    new Logger(MailModule.name).warn(
      'BREVO_API_KEY가 없어 메일을 보내지 않고 서버 로그에 출력합니다.',
    );
    return new ConsoleMailSender();
  }

  return new BrevoMailSender({
    apiKey,
    fromEmail: config.get('MAIL_FROM_EMAIL', { infer: true })!,
    fromName: config.get('MAIL_FROM_NAME', { infer: true }),
  });
}

@Global()
@Module({
  providers: [
    {
      provide: MailSender,
      inject: [ConfigService],
      useFactory: createMailSender,
    },
  ],
  exports: [MailSender],
})
export class MailModule {}
