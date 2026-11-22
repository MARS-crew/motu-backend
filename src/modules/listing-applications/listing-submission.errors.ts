import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const ListingSubmissionErrors = {
  VALIDATION: {
    code: 'LISTING_SUBMISSION_VALIDATION_FAILED',
    message: '최종 제출 전 입력 항목을 확인해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  CONFLICT: {
    code: 'LISTING_SUBMISSION_CONFLICT',
    message:
      '신청서가 변경되었습니다. 최신 내용을 확인한 뒤 다시 제출해 주세요.',
    status: HttpStatus.CONFLICT,
  },
  STATE: {
    code: 'LISTING_SUBMISSION_INVALID_STATUS',
    message: '최초 제출할 수 없는 신청 상태입니다.',
    status: HttpStatus.CONFLICT,
  },
  NUMBER_LIMIT: {
    code: 'LISTING_SUBMISSION_NUMBER_LIMIT',
    message:
      '오늘의 신청번호 발급 한도에 도달했습니다. 다음 날 다시 시도해 주세요.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
