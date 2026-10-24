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
  INSUFFICIENT_QTY: {
    code: 'ORDER_INSUFFICIENT_QTY',
    message: '매도 가능 수량이 부족합니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  /** 닿을 수 있는 가격대에 내 반대편 미체결 주문이 있는 경우 */
  SELF_TRADE: {
    code: 'ORDER_SELF_TRADE',
    message:
      '내 미체결 주문과 체결될 수 있는 가격입니다. 기존 주문을 취소한 뒤 다시 주문해 주세요.',
    status: HttpStatus.CONFLICT,
  },
  /** 같은 clientOrderId로 내용(상품·방향·가격·수량)이 다른 주문을 보낸 경우 */
  CLIENT_ID_REUSED: {
    code: 'ORDER_CLIENT_ID_REUSED',
    message: '이미 다른 내용으로 접수된 주문 요청입니다. 다시 주문해 주세요.',
    status: HttpStatus.CONFLICT,
  },
  NOT_FOUND: {
    code: 'ORDER_NOT_FOUND',
    message: '존재하지 않는 주문입니다.',
    status: HttpStatus.NOT_FOUND,
  },
  NOT_CANCELABLE: {
    code: 'ORDER_NOT_CANCELABLE',
    message: '이미 모두 체결된 주문은 취소할 수 없습니다.',
    status: HttpStatus.CONFLICT,
  },
  INVALID_CURSOR: {
    code: 'ORDER_INVALID_CURSOR',
    message: '목록을 처음부터 다시 불러와 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
