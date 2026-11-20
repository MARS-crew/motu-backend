import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';
export const ListingReviewErrors = {
  STATE: {
    code: 'LISTING_REVIEW_INVALID_STATE',
    message:
      '현재 신청 상태에서는 이 심사 처리를 할 수 없습니다. 최신 상태를 확인해 주세요.',
    status: HttpStatus.CONFLICT,
  },
  DEADLINE: {
    code: 'LISTING_REVIEW_INVALID_DEADLINE',
    message:
      '보완 기한은 현재 시각 이후여야 하며, 연장은 기존 기한보다 늦어야 합니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  APPROVAL: {
    code: 'LISTING_REVIEW_INVALID_APPROVAL',
    message:
      '최종 상장가·발행량·상장일·거래 시작일시와 가격 조정 사유를 확인해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  DATA: {
    code: 'LISTING_REVIEW_INCOMPLETE_APPLICATION',
    message:
      '상품 생성에 필요한 신청 정보와 저장 완료된 첨부자료를 확인해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  ACCOUNT: {
    code: 'LISTING_REVIEW_ISSUER_ACCOUNT_REQUIRED',
    message: '신청자의 거래 계좌가 필요합니다.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
