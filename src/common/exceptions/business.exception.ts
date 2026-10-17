import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 비즈니스 에러 정의. 각 도메인의 `<도메인>.errors.ts`에 모아서 선언한다.
 */
export interface ErrorDefinition {
  /** 프론트에서 분기할 에러 코드 (예: USER_NOT_FOUND) */
  code: string;
  /** 사용자에게 보여줄 기본 메시지 */
  message: string;
  status: HttpStatus;
}

/**
 * 도메인 에러 정의로 던지는 예외. HttpExceptionFilter가 `{ code, message }` 응답으로 변환한다.
 *
 * 예) throw new BusinessException(UserErrors.EMAIL_DUPLICATED)
 *     throw new BusinessException(VerificationErrors.CODE_MISMATCH, `... (남은 횟수 ${n}회)`)
 */
export class BusinessException extends HttpException {
  constructor(
    readonly error: ErrorDefinition,
    message: string = error.message,
  ) {
    super({ code: error.code, message }, error.status);
  }
}
