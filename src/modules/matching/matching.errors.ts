import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const MatchingErrors = {
  /** 거래 대기(PENDING)가 아닌 상품을 상장(거래 시작)하려는 경우 */
  LISTING_NOT_PENDING: {
    code: 'LISTING_NOT_PENDING',
    message: '거래 대기 중인 상품만 거래를 시작할 수 있습니다.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
