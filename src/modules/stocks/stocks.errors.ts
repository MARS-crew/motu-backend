import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const StockErrors = {
  NOT_FOUND: {
    code: 'STOCK_NOT_FOUND',
    message: '존재하지 않는 상품입니다.',
    status: HttpStatus.NOT_FOUND,
  },
  /** 현재 거래 상태에서 할 수 없는 거래 중지·재개·종료 */
  INVALID_TRADE_STATUS: {
    code: 'STOCK_INVALID_TRADE_STATUS',
    message: '현재 상품 상태에서는 할 수 없는 처리입니다.',
    status: HttpStatus.CONFLICT,
  },
  SECTOR_NOT_FOUND: {
    code: 'STOCK_SECTOR_NOT_FOUND',
    message: '존재하지 않는 카테고리입니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  METRICS_DATE_REQUIRED: {
    code: 'STOCK_METRICS_DATE_REQUIRED',
    message: 'MAU나 거래액을 입력하면 지표 기준일도 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  NOT_CHANGED: {
    code: 'STOCK_NOT_CHANGED',
    message: '변경된 내용이 없습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  INVALID_CURSOR: {
    code: 'STOCK_INVALID_CURSOR',
    message: '목록을 처음부터 다시 불러와 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
