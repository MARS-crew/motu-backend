import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { EnvironmentVariables } from './config/env.validation.js';
import { setupSwagger } from './config/swagger.config.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  // 로거가 준비되기 전 부트스트랩 로그도 pino로 출력되도록 버퍼링한다.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const config = app.get(ConfigService<EnvironmentVariables, true>);

  setupApp(app);
  setupSwagger(app);

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
