import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const OrderErrors = {
  STOCK_NOT_TRADABLE: {
    code: 'ORDER_STOCK_NOT_TRADABLE',
    message: '지금은 거래할 수 없는 상품입니다.',
    status: HttpStatus.CONFLICT,
  },
  INVALID_PRICE_TICK: {
    code: 'ORDER_INVALID_PRICE_TICK',
    message: '주문 가격을 호가 단위에 맞게 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  PRICE_TOO_LOW: {
    code: 'ORDER_PRICE_TOO_LOW',
    message: '최소 주문 가격보다 낮게 주문할 수 없습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  QTY_TOO_LOW: {
    code: 'ORDER_QTY_TOO_LOW',
    message: '최소 주문 수량보다 적게 주문할 수 없습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  INSUFFICIENT_CASH: {
    code: 'ORDER_INSUFFICIENT_CASH',
    message: '사용 가능 포인트가 부족합니다.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
