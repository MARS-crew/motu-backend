import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';
import { GLOBAL_PREFIX } from '../setup-app.js';
import { EnvironmentVariables, NodeEnv } from './env.validation.js';

const REQUEST_ID_HEADER = 'x-request-id';
const HEALTH_CHECK_PATH = `/${GLOBAL_PREFIX}/health`;

/**
 * pino 로거 설정.
 * - development: pino-pretty로 읽기 쉽게 출력
 * - production: JSON 한 줄씩 출력 (Railway 로그에서 검색·필터링용)
 * - test: 출력하지 않음
 */
export function createLoggerOptions(
  config: ConfigService<EnvironmentVariables, true>,
): Params {
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const isDevelopment = nodeEnv === NodeEnv.Development;

  return {
    pinoHttp: {
      level:
        nodeEnv === NodeEnv.Test
          ? 'silent'
          : config.get('LOG_LEVEL', { infer: true }),
      transport: isDevelopment
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
      // 요청마다 ID를 붙여 같은 요청의 로그를 묶어 본다. 클라이언트가 보낸 값이 있으면 그대로 쓴다.
      genReqId: (req, res) => {
        const requestId = req.headers[REQUEST_ID_HEADER] ?? randomUUID();
        res.setHeader(REQUEST_ID_HEADER, requestId);
        return requestId;
      },
      // 헬스 체크는 주기적으로 호출되므로 요청 로그를 남기지 않는다.
      autoLogging: {
        ignore: (req) => req.url?.split('?')[0] === HEALTH_CHECK_PATH,
      },
      // 기본 serializer는 헤더 전체(토큰 포함)를 남기므로 필요한 값만 남긴다.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    },
  };
}
