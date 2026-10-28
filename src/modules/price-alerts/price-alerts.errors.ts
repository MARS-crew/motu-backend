import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const PriceAlertErrors = {
  /** 거래 대기(PENDING)·종료(CLOSED) 상품 */
  STOCK_NOT_ALERTABLE: {
    code: 'PRICE_ALERT_STOCK_NOT_ALERTABLE',
    message: '지금은 알림을 설정할 수 없는 상품입니다.',
    status: HttpStatus.CONFLICT,
  },
  INVALID_PRICE_TICK: {
    code: 'PRICE_ALERT_INVALID_PRICE_TICK',
    message: '설정 가격을 호가 단위에 맞게 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  PRICE_TOO_LOW: {
    code: 'PRICE_ALERT_PRICE_TOO_LOW',
    message: '최소 주문 가격보다 낮게 설정할 수 없습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  /** 이미 그 가격이라 도달을 알릴 수 없다. */
  SAME_AS_CURRENT_PRICE: {
    code: 'PRICE_ALERT_SAME_AS_CURRENT_PRICE',
    message: '현재가와 다른 가격을 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  /** 같은 상품에 같은 가격의 알림이 이미 있다. 울린 알림이면 수정해서 다시 켠다. */
  DUPLICATE: {
    code: 'PRICE_ALERT_DUPLICATE',
    message: '이미 같은 가격으로 설정한 알림이 있습니다.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
