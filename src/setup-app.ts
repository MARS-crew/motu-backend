import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { EnvironmentVariables } from './config/env.validation.js';

export const GLOBAL_PREFIX = 'api';

/**
 * 전역 설정. main.ts와 e2e 테스트가 같은 설정으로 앱을 띄우도록 분리한다.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.enableCors({
    origin: corsOrigins
      ? corsOrigins.split(',').map((origin) => origin.trim())
      : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
}
