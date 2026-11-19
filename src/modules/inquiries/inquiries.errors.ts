import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const InquiryErrors = {
  LEGACY_SUBMISSION_RETIRED: {
    code: 'INQUIRY_SUBMISSION_RETIRED',
    message:
      '이전 문의 접수 방식은 종료되었습니다. 로그인 없이 계정·인증 문의 화면에서 접수해 주세요.',
    status: HttpStatus.GONE,
  },
  SUBMISSION_RATE_LIMITED: {
    code: 'INQUIRY_SUBMISSION_RATE_LIMITED',
    message:
      '해당 회신 이메일의 문의 접수 한도에 도달했습니다. 최대 1시간 후 다시 시도해 주세요.',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
  UNAUTHORIZED: {
    code: 'INQUIRY_UNAUTHORIZED',
    message: '문의 내역을 조회할 수 있는 인증 정보가 필요합니다.',
    status: HttpStatus.UNAUTHORIZED,
  },
  TOKEN_EXPIRED: {
    code: 'INQUIRY_TOKEN_EXPIRED',
    message:
      '문의 조회 시간이 만료되었습니다. 계정·인증 문의 화면을 이용해 주세요.',
    status: HttpStatus.UNAUTHORIZED,
  },
  NOT_FOUND: {
    code: 'INQUIRY_NOT_FOUND',
    message: '문의를 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
} as const satisfies Record<string, ErrorDefinition>;
