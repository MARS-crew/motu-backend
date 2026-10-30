import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const TwoFactorErrors = {
  NOT_ENABLED: {
    code: 'TWO_FACTOR_NOT_ENABLED',
    message: '2차 보안을 먼저 설정해 주세요.',
    status: HttpStatus.CONFLICT,
  },
  /** 프론트는 공통 2차 보안 화면(USR-AUTH-009)으로 보낸 뒤 같은 요청을 다시 보낸다. */
  REQUIRED: {
    code: 'TWO_FACTOR_REQUIRED',
    message: '추가 인증이 필요합니다. 휴대폰 인증을 진행해 주세요.',
    status: HttpStatus.FORBIDDEN,
  },
  LOCKED: {
    code: 'TWO_FACTOR_LOCKED',
    message:
      '인증번호를 5회 연속 잘못 입력해 2차 보안 인증을 30분 동안 제한합니다. 제한이 끝나면 다시 시도할 수 있습니다.',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
  SAME_PHONE_NUMBER: {
    code: 'TWO_FACTOR_SAME_PHONE_NUMBER',
    message: '이미 등록된 휴대폰 번호입니다.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
