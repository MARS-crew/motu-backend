import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const TradeHistoryErrors = {
  INVALID_PERIOD: {
    code: 'TRADE_HISTORY_INVALID_PERIOD',
    message: '조회 시작일은 종료일보다 늦을 수 없습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
