import { plainToInstance } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  Max,
  Min,
  ValidateIf,
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

  /** Brevo API 키. 비우면 메일을 보내지 않고 서버 로그에 출력한다. 운영 환경에서는 필수. */
  @ValidateIf(usesBrevo)
  @IsString()
  @IsNotEmpty()
  BREVO_API_KEY?: string;

  /** 발신자 이메일. Brevo에서 발신자 인증을 마친 주소여야 한다. Brevo로 보낼 때 필수. */
  @ValidateIf(usesBrevo)
  @IsEmail()
  MAIL_FROM_EMAIL?: string;

  @IsEnum({ local: 'local', s3: 's3' })
  FILE_STORAGE_DRIVER: string = 'local';

  /** 운영에서 local을 사용하지 못하도록 검증한다. */
  @ValidateIf((env) => env.FILE_STORAGE_DRIVER === 's3')
  @IsUrl({ require_tld: false })
  S3_ENDPOINT?: string;

  @ValidateIf((env) => env.FILE_STORAGE_DRIVER === 's3')
  @IsString()
  @IsNotEmpty()
  S3_BUCKET?: string;

  @ValidateIf((env) => env.FILE_STORAGE_DRIVER === 's3')
  @IsString()
  @IsNotEmpty()
  S3_ACCESS_KEY_ID?: string;

  @ValidateIf((env) => env.FILE_STORAGE_DRIVER === 's3')
  @IsString()
  @IsNotEmpty()
  S3_SECRET_ACCESS_KEY?: string;

  /** 받는 사람에게 보이는 발신자 이름 */
  @IsString()
  @IsNotEmpty()
  MAIL_FROM_NAME: string = 'MOTU';
}

/** 운영 환경이거나 BREVO_API_KEY가 있으면 Brevo로 메일을 보낸다. */
function usesBrevo(env: EnvironmentVariables): boolean {
  return env.NODE_ENV === NodeEnv.Production || !!env.BREVO_API_KEY;
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
  if (
    validated.NODE_ENV === NodeEnv.Production &&
    validated.FILE_STORAGE_DRIVER !== 's3'
  )
    throw new Error(
      '운영 환경에서는 FILE_STORAGE_DRIVER=s3 설정이 필요합니다.',
    );
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('\n');
    throw new Error(`환경 변수 검증 실패:\n${messages}`);
  }

  return validated;
}
