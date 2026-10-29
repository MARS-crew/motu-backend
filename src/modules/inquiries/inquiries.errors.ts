import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const InquiryErrors = {
  INVALID_TITLE: {
    code: 'INQUIRY_INVALID_TITLE',
    message: '문의 제목은 1자 이상 100자 이하로 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  INVALID_CONTENT: {
    code: 'INQUIRY_INVALID_CONTENT',
    message: '문의 내용은 1자 이상 5000자 이하로 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  ACCESS_TEMPORARILY_BLOCKED: {
    code: 'INQUIRY_ACCESS_TEMPORARILY_BLOCKED',
    message: '문의 본인 확인에 5회 실패했습니다. 15분 후 다시 시도해 주세요.',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
  INVALID_CREDENTIALS: {
    code: 'INQUIRY_INVALID_CREDENTIALS',
    message: '아이디 또는 비밀번호를 확인해 주세요.',
    status: HttpStatus.UNAUTHORIZED,
  },
  UNAUTHORIZED: {
    code: 'INQUIRY_UNAUTHORIZED',
    message: '문의 이용을 위한 본인 확인이 필요합니다.',
    status: HttpStatus.UNAUTHORIZED,
  },
  TOKEN_EXPIRED: {
    code: 'INQUIRY_TOKEN_EXPIRED',
    message: '문의 이용 시간이 만료되었습니다. 본인 확인을 다시 진행해 주세요.',
    status: HttpStatus.UNAUTHORIZED,
  },
  ACCOUNT_NOT_RESTRICTED: {
    code: 'INQUIRY_ACCOUNT_NOT_RESTRICTED',
    message: '잠금 또는 정지된 계정만 제한 해제 문의를 접수할 수 있습니다.',
    status: HttpStatus.FORBIDDEN,
  },
  NOT_FOUND: {
    code: 'INQUIRY_NOT_FOUND',
    message: '문의를 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  TOO_MANY_ATTEMPTS: {
    code: 'INQUIRY_TOO_MANY_ATTEMPTS',
    message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
} as const satisfies Record<string, ErrorDefinition>;
