import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const VerificationErrors = {
  NOT_FOUND: {
    code: 'VERIFICATION_NOT_FOUND',
    message: '인증번호를 먼저 요청해 주세요.',
    status: HttpStatus.NOT_FOUND,
  },
  EXPIRED: {
    code: 'VERIFICATION_EXPIRED',
    message: '인증번호가 만료되었습니다. 인증번호를 다시 받아 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  CODE_MISMATCH: {
    code: 'VERIFICATION_CODE_MISMATCH',
    message: '인증번호가 일치하지 않습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  REQUIRED: {
    code: 'VERIFICATION_REQUIRED',
    message: '인증이 완료되지 않았거나 만료되었습니다. 다시 인증해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  RESEND_TOO_SOON: {
    code: 'VERIFICATION_RESEND_TOO_SOON',
    message: '잠시 후 인증번호를 다시 요청해 주세요.',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
  ATTEMPTS_EXCEEDED: {
    code: 'VERIFICATION_ATTEMPTS_EXCEEDED',
    message: '인증번호 입력 횟수를 초과했습니다. 인증번호를 다시 받아 주세요.',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
} as const satisfies Record<string, ErrorDefinition>;
