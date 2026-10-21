import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const StockErrors = {
  NOT_FOUND: {
    code: 'STOCK_NOT_FOUND',
    message: '존재하지 않는 상품입니다.',
    status: HttpStatus.NOT_FOUND,
  },
  INVALID_CURSOR: {
    code: 'STOCK_INVALID_CURSOR',
    message: '목록을 처음부터 다시 불러와 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
