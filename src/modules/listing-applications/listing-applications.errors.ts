import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const ListingApplicationErrors = {
  NOT_FOUND: {
    code: 'LISTING_APPLICATION_NOT_FOUND',
    message: '상장 신청서를 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  EXPIRED: {
    code: 'LISTING_DRAFT_EXPIRED',
    message: '마지막 저장 후 90일이 지나 만료된 신청서입니다.',
    status: HttpStatus.GONE,
  },
  NOT_DRAFT: {
    code: 'LISTING_APPLICATION_NOT_DRAFT',
    message: '작성 중인 신청서만 변경할 수 있습니다.',
    status: HttpStatus.CONFLICT,
  },
  LIMIT: {
    code: 'LISTING_DRAFT_LIMIT_EXCEEDED',
    message: '임시저장 신청서는 최대 5건까지 보관할 수 있습니다.',
    status: HttpStatus.CONFLICT,
  },
  URL: {
    code: 'LISTING_INVALID_URL',
    message: 'https://로 시작하는 올바른 공식 URL을 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  DUPLICATE_URL: {
    code: 'LISTING_URL_IN_PROGRESS',
    message: '동일한 공식 URL로 진행 중인 상장 신청이 있습니다.',
    status: HttpStatus.CONFLICT,
  },
  ATTACHMENT: {
    code: 'LISTING_INVALID_ATTACHMENT',
    message: '해당 용도로 저장한 본인의 첨부 작성 묶음을 선택해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  CONFLICT: {
    code: 'LISTING_DRAFT_CONFLICT',
    message: '다른 요청이 신청서를 변경했습니다. 잠시 후 다시 시도해 주세요.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
