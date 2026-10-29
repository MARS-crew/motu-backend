import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, NodeEnv } from '../../config/env.validation.js';
import { BrevoSmsSender } from './brevo-sms-sender.js';
import { ConsoleSmsSender } from './console-sms-sender.js';
import { SmsSender } from './sms-sender.js';
import { UnavailableSmsSender } from './unavailable-sms-sender.js';

/**
 * BREVO_API_KEY와 SMS_SENDER가 모두 있으면 Brevo로 보낸다.
 * 없으면 로컬은 서버 로그에 출력하고, 운영은 인증번호가 로그에 남지 않도록 발송 실패로 처리한다.
 */
function createSmsSender(
  config: ConfigService<EnvironmentVariables, true>,
): SmsSender {
  const apiKey = config.get('BREVO_API_KEY', { infer: true });
  const sender = config.get('SMS_SENDER', { infer: true });
  if (apiKey && sender) {
    return new BrevoSmsSender({ apiKey, sender });
  }

  const logger = new Logger(SmsModule.name);
  if (config.get('NODE_ENV', { infer: true }) === NodeEnv.Production) {
    logger.warn(
      'SMS_SENDER가 없어 SMS를 보낼 수 없습니다. 2차 보안 SMS 인증이 실패합니다.',
    );
    return new UnavailableSmsSender();
  }
  logger.warn('SMS_SENDER가 없어 SMS를 보내지 않고 서버 로그에 출력합니다.');
  return new ConsoleSmsSender();
}

@Global()
@Module({
  providers: [
    {
      provide: SmsSender,
      inject: [ConfigService],
      useFactory: createSmsSender,
    },
  ],
  exports: [SmsSender],
})
export class SmsModule {}
