import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const UserErrors = {
  LOGIN_ID_DUPLICATED: {
    code: 'LOGIN_ID_DUPLICATED',
    message: '이미 사용 중인 아이디입니다.',
    status: HttpStatus.CONFLICT,
  },
  NICKNAME_DUPLICATED: {
    code: 'NICKNAME_DUPLICATED',
    message: '이미 사용 중인 닉네임입니다.',
    status: HttpStatus.CONFLICT,
  },
  EMAIL_DUPLICATED: {
    code: 'EMAIL_DUPLICATED',
    message: '이미 가입된 이메일입니다.',
    status: HttpStatus.CONFLICT,
  },
  NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    message: '존재하지 않는 사용자입니다.',
    status: HttpStatus.NOT_FOUND,
  },
  /** 동시 가입으로 UNIQUE 제약에 걸렸지만 어떤 값이 중복인지 알 수 없는 경우 */
  DUPLICATED: {
    code: 'USER_DUPLICATED',
    message: '이미 가입된 정보입니다.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
