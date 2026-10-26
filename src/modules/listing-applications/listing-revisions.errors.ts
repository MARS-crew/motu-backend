import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const ListingRevisionErrors = {
  NOT_FOUND: {
    code: 'LISTING_REVISION_NOT_FOUND',
    message: '신청서 또는 보완 요청을 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  INVALID_STATE: {
    code: 'LISTING_REVISION_INVALID_STATE',
    message: '현재 신청 상태에서는 재제출을 처리할 수 없습니다.',
    status: HttpStatus.CONFLICT,
  },
  DEADLINE_PASSED: {
    code: 'LISTING_REVISION_DEADLINE_PASSED',
    message: '보완기한이 지났습니다. 관리자에게 기한 연장을 요청해 주세요.',
    status: HttpStatus.GONE,
  },
  ALREADY_SUBMITTED: {
    code: 'LISTING_REVISION_ALREADY_SUBMITTED',
    message: '이미 재제출한 보완 요청입니다.',
    status: HttpStatus.CONFLICT,
  },
  EVIDENCE: {
    code: 'LISTING_REVISION_INVALID_EVIDENCE',
    message:
      '본인의 증빙용 묶음에 저장 완료된 파일·링크 1~10개와 10~500자의 설명이 필요합니다.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
