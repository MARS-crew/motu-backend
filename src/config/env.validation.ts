import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum LogLevel {
  Fatal = 'fatal',
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Trace = 'trace',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(0)
  @Max(65535)
  PORT: number = 3000;

  /** 허용할 CORS origin 목록 (쉼표로 구분). 비우면 모든 origin을 허용한다. */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  /** PostgreSQL 접속 URL */
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsEnum(LogLevel)
  LOG_LEVEL: LogLevel = LogLevel.Info;

  /** Access 토큰 서명 키. `openssl rand -base64 32`로 생성한다. */
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  /** Access 토큰 유효시간 (초) */
  @IsInt()
  @Min(60)
  JWT_ACCESS_EXPIRES_IN: number = 900;

  /** Refresh 토큰 유효기간 (일) */
  @IsInt()
  @Min(1)
  JWT_REFRESH_EXPIRES_IN_DAYS: number = 14;

  /** 비밀번호 재설정 메일에 넣을 화면 주소. 뒤에 `?token=...`이 붙는다. */
  @IsUrl({ require_tld: false })
  PASSWORD_RESET_URL: string = 'http://localhost:5173/password-reset';
}

/**
 * 앱 시작 시 환경 변수를 검증한다. 값이 잘못되면 서버가 뜨지 않는다.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('\n');
    throw new Error(`환경 변수 검증 실패:\n${messages}`);
  }

  return validated;
}
