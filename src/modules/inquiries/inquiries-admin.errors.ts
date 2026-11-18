import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';
export const InquiryAdminErrors = {
  NOT_FOUND: {
    code: 'INQUIRY_ADMIN_NOT_FOUND',
    message: '관리할 문의를 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  ASSIGNED: {
    code: 'INQUIRY_ADMIN_ALREADY_ASSIGNED',
    message: '다른 관리자가 처리 중인 문의입니다.',
    status: HttpStatus.CONFLICT,
  },
  OWNER: {
    code: 'INQUIRY_ADMIN_ASSIGNEE_ONLY',
    message: '담당 관리자만 문의를 처리할 수 있습니다.',
    status: HttpStatus.FORBIDDEN,
  },
  STATE: {
    code: 'INQUIRY_ADMIN_INVALID_STATUS',
    message: '현재 문의 상태에서는 처리할 수 없습니다.',
    status: HttpStatus.CONFLICT,
  },
  EMAIL: {
    code: 'INQUIRY_REPLY_EMAIL_REQUIRED',
    message: '유효한 회신 이메일이 필요합니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  VERSION: {
    code: 'INQUIRY_REPLY_VERSION_CONFLICT',
    message: '답변이 변경되었습니다. 최신 내용을 다시 조회해 주세요.',
    status: HttpStatus.CONFLICT,
  },
  EMPTY: {
    code: 'INQUIRY_REPLY_DRAFT_REQUIRED',
    message: '저장된 답변이 필요합니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  SENDING: {
    code: 'INQUIRY_REPLY_SENDING',
    message: '답변 발송을 처리 중입니다. 잠시 후 같은 요청으로 확인해 주세요.',
    status: HttpStatus.CONFLICT,
  },
  UNKNOWN: {
    code: 'INQUIRY_REPLY_DELIVERY_UNKNOWN',
    message:
      '발송 여부를 확인할 수 없습니다. 발송 이력을 확인한 뒤 재발송 여부를 결정해 주세요.',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
  FAILED: {
    code: 'INQUIRY_REPLY_SEND_FAILED',
    message: '이메일 발송이 거절되었습니다. 답변과 처리 중 상태는 유지됩니다.',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
  KEY: {
    code: 'INQUIRY_REPLY_REQUEST_CONFLICT',
    message: '같은 요청 식별자를 다른 발송 요청에 사용할 수 없습니다.',
    status: HttpStatus.CONFLICT,
  },
  RETRY: {
    code: 'INQUIRY_REPLY_RETRY_CONFIRMATION_REQUIRED',
    message: '발송 이력 확인 후 재발송 동의와 사유를 입력해 주세요.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
