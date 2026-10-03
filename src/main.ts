import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { EnvironmentVariables } from './config/env.validation.js';
import { setupSwagger } from './config/swagger.config.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<EnvironmentVariables, true>);

  setupApp(app);
  setupSwagger(app);

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
