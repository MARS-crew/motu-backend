import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', originalUrl: '/api/test' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    json.mockClear();
    status.mockClear();
  });

  it('HttpException을 상태 이름 코드와 메시지로 변환한다', () => {
    filter.catch(new NotFoundException('존재하지 않는 사용자입니다.'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'NOT_FOUND', message: '존재하지 않는 사용자입니다.' },
    });
  });

  it('응답 객체에 code가 있으면 비즈니스 에러 코드로 사용한다', () => {
    filter.catch(
      new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '존재하지 않는 사용자입니다.',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: '존재하지 않는 사용자입니다.' },
    });
  });

  it('BusinessException은 에러 정의의 상태, 코드, 메시지로 변환한다', () => {
    const error = {
      code: 'EMAIL_DUPLICATED',
      message: '이미 가입된 이메일입니다.',
      status: HttpStatus.CONFLICT,
    };

    filter.catch(new BusinessException(error), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'EMAIL_DUPLICATED', message: '이미 가입된 이메일입니다.' },
    });

    filter.catch(new BusinessException(error, '다른 메시지'), host);
    expect(json).toHaveBeenLastCalledWith({
      success: false,
      error: { code: 'EMAIL_DUPLICATED', message: '다른 메시지' },
    });
  });

  it('검증 실패 메시지 배열은 details로 내려준다', () => {
    filter.catch(
      new BadRequestException([
        'email must be an email',
        'password should not be empty',
      ]),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: '요청 값이 올바르지 않습니다.',
        details: ['email must be an email', 'password should not be empty'],
      },
    });
  });

  it('예상하지 못한 에러는 내용을 숨기고 500으로 응답한다', () => {
    filter.catch(new Error('DB connection lost'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '서버 내부 오류가 발생했습니다.',
      },
    });
  });
});
