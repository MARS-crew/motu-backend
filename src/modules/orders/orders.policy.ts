import { BusinessException } from '../../common/exceptions/business.exception.js';
import { Stock, TradeStatus } from '../../generated/prisma/client.js';
import { BPS_DENOMINATOR, FEE_RATE_BPS } from './orders.constants.js';
import { OrderErrors } from './orders.errors.js';

type OrderRuleStock = Pick<
  Stock,
  'tradeStatus' | 'priceTickSize' | 'minOrderPrice' | 'minOrderQty'
>;

/**
 * 체결 금액에 대한 수수료. 원 단위 미만은 버린다.
 */
export function calculateFee(
  amount: bigint,
  feeRateBps: bigint = FEE_RATE_BPS,
): bigint {
  return (amount * feeRateBps) / BPS_DENOMINATOR;
}

/**
 * 상품의 거래 상태와 주문 규칙(호가 단위, 최소 주문 가격·수량)을 확인한다.
 * 포인트·보유 수량과 자기 체결 여부는 여기서 보지 않는다.
 */
export function validateOrderRules(
  stock: OrderRuleStock,
  price: bigint,
  qty: bigint,
): void {
  if (stock.tradeStatus !== TradeStatus.ACTIVE) {
    throw new BusinessException(OrderErrors.STOCK_NOT_TRADABLE, undefined, {
      tradeStatus: stock.tradeStatus,
    });
  }
  if (price % stock.priceTickSize !== 0n) {
    throw new BusinessException(OrderErrors.INVALID_PRICE_TICK, undefined, {
      priceTickSize: Number(stock.priceTickSize),
    });
  }
  if (price < stock.minOrderPrice) {
    throw new BusinessException(OrderErrors.PRICE_TOO_LOW, undefined, {
      minOrderPrice: Number(stock.minOrderPrice),
    });
  }
  if (qty < stock.minOrderQty) {
    throw new BusinessException(OrderErrors.QTY_TOO_LOW, undefined, {
      minOrderQty: Number(stock.minOrderQty),
    });
  }
}
