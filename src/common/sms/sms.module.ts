import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { BrevoSmsSender } from './brevo-sms-sender.js';
import { ConsoleSmsSender } from './console-sms-sender.js';
import { SmsSender } from './sms-sender.js';

/**
 * BREVO_API_KEY와 SMS_SENDER가 모두 있으면 Brevo로 보내고, 없으면 서버 로그에 출력한다.
 * SMS는 유료라 발송 여부를 정하기 전까지 운영(Railway)도 서버 로그로 인증번호를 확인한다.
 */
function createSmsSender(
  config: ConfigService<EnvironmentVariables, true>,
): SmsSender {
  const apiKey = config.get('BREVO_API_KEY', { infer: true });
  const sender = config.get('SMS_SENDER', { infer: true });
  if (apiKey && sender) {
    return new BrevoSmsSender({ apiKey, sender });
  }

  new Logger(SmsModule.name).warn(
    'SMS_SENDER가 없어 SMS를 보내지 않고 서버 로그에 출력합니다.',
  );
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
