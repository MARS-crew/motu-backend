import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorBody, ApiErrorResponse } from '../types/api-response.type.js';

const VALIDATION_ERROR_MESSAGE = '요청 값이 올바르지 않습니다.';
const INTERNAL_ERROR_MESSAGE = '서버 내부 오류가 발생했습니다.';

/**
 * 모든 예외를 `{ success: false, error: { code, message, details? } }` 형태로 변환한다.
 *
 * 비즈니스 에러 코드가 필요하면 응답 객체에 `code`를 담아 던진다.
 * 예) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: '존재하지 않는 사용자입니다.' })
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const error = this.toErrorBody(exception, status);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.originalUrl} ${status} - ${error.message}`,
      );
    }

    const body: ApiErrorResponse = { success: false, error };
    response.status(status).json(body);
  }

  private toErrorBody(exception: unknown, status: number): ApiErrorBody {
    const defaultCode = HttpStatus[status] ?? 'UNKNOWN_ERROR';

    if (!(exception instanceof HttpException) || status >= 500) {
      return { code: defaultCode, message: INTERNAL_ERROR_MESSAGE };
    }

    const res = exception.getResponse();
    if (typeof res === 'string') {
      return { code: defaultCode, message: res };
    }

    const { code, message } = res as { code?: unknown; message?: unknown };
    const errorCode = typeof code === 'string' ? code : defaultCode;

    // ValidationPipe는 message를 문자열 배열로 던진다.
    if (Array.isArray(message)) {
      return {
        code: errorCode,
        message: VALIDATION_ERROR_MESSAGE,
        details: message,
      };
    }

    return {
      code: errorCode,
      message: typeof message === 'string' ? message : exception.message,
    };
  }
}
