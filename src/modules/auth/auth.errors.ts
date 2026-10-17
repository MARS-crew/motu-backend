import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const AuthErrors = {
  INVALID_CREDENTIALS: {
    code: 'AUTH_INVALID_CREDENTIALS',
    message: '아이디 또는 비밀번호를 확인해 주세요.',
    status: HttpStatus.UNAUTHORIZED,
  },
  ACCOUNT_LOCKED: {
    code: 'AUTH_ACCOUNT_LOCKED',
    message:
      '비밀번호 입력 실패가 5회 누적되어 계정이 잠겼습니다. 문의하기를 통해 잠금 해제를 요청해 주세요.',
    status: HttpStatus.FORBIDDEN,
  },
  ACCOUNT_BLOCKED: {
    code: 'AUTH_ACCOUNT_BLOCKED',
    message: '이용이 정지된 계정입니다. 문의하기를 통해 확인해 주세요.',
    status: HttpStatus.FORBIDDEN,
  },
  UNAUTHORIZED: {
    code: 'AUTH_UNAUTHORIZED',
    message: '로그인이 필요합니다.',
    status: HttpStatus.UNAUTHORIZED,
  },
  /** 프론트는 이 코드를 받으면 Refresh 토큰으로 재발급한다. */
  TOKEN_EXPIRED: {
    code: 'AUTH_TOKEN_EXPIRED',
    message: '로그인이 만료되었습니다.',
    status: HttpStatus.UNAUTHORIZED,
  },
  INVALID_REFRESH_TOKEN: {
    code: 'AUTH_INVALID_REFRESH_TOKEN',
    message: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
    status: HttpStatus.UNAUTHORIZED,
  },
  FORBIDDEN: {
    code: 'AUTH_FORBIDDEN',
    message: '접근 권한이 없습니다.',
    status: HttpStatus.FORBIDDEN,
  },
} as const satisfies Record<string, ErrorDefinition>;
