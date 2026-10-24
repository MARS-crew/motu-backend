import { BusinessException } from '../../common/exceptions/business.exception.js';
import { TradeStatus } from '../../generated/prisma/client.js';
import { OrderErrors } from './orders.errors.js';
import {
  calculateBuyLockAmount,
  calculateFee,
  validateOrderRules,
} from './orders.policy.js';

describe('calculateFee', () => {
  it('체결 금액에 수수료율(bp)을 곱한다', () => {
    expect(calculateFee(1_000_000n, 15n)).toBe(1_500n);
  });

  it('원 단위 미만은 버린다', () => {
    // 9,999 × 0.15% = 14.9985
    expect(calculateFee(9_999n, 15n)).toBe(14n);
  });

  it('수수료율을 넘기지 않으면 현재 수수료율(0.02%)을 쓴다', () => {
    expect(calculateFee(1_000_000n)).toBe(200n);
  });
});

describe('calculateBuyLockAmount', () => {
  it('주문 금액(가격 × 수량)에 수수료를 더한다', () => {
    // 5,000 × 200 = 1,000,000, 수수료 0.15% = 1,500
    expect(calculateBuyLockAmount(5_000n, 200n, 15n)).toBe(1_001_500n);
  });

  it('수수료율을 넘기지 않으면 현재 수수료율(0.02%)을 쓴다', () => {
    expect(calculateBuyLockAmount(5_000n, 200n)).toBe(1_000_200n);
  });
});

describe('validateOrderRules', () => {
  const stock = {
    tradeStatus: TradeStatus.ACTIVE,
    priceTickSize: 10n,
    minOrderPrice: 100n,
    minOrderQty: 5n,
  };

  const errorOf = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      return error as BusinessException;
    }
    throw new Error('예외가 발생하지 않았습니다.');
  };

  it('규칙을 모두 지키면 통과한다', () => {
    expect(() => validateOrderRules(stock, 100n, 5n)).not.toThrow();
  });

  it.each([TradeStatus.PENDING, TradeStatus.PAUSED, TradeStatus.CLOSED])(
    '거래 상태가 %s면 주문할 수 없다',
    (tradeStatus) => {
      const error = errorOf(() =>
        validateOrderRules({ ...stock, tradeStatus }, 100n, 5n),
      );

      expect(error.error).toBe(OrderErrors.STOCK_NOT_TRADABLE);
      expect(error.getResponse()).toMatchObject({ details: { tradeStatus } });
    },
  );

  it('가격이 호가 단위의 배수가 아니면 주문할 수 없다', () => {
    const error = errorOf(() => validateOrderRules(stock, 105n, 5n));

    expect(error.error).toBe(OrderErrors.INVALID_PRICE_TICK);
    expect(error.getResponse()).toMatchObject({
      details: { priceTickSize: 10 },
    });
  });

  it('최소 주문 가격보다 낮으면 주문할 수 없다', () => {
    const error = errorOf(() => validateOrderRules(stock, 90n, 5n));

    expect(error.error).toBe(OrderErrors.PRICE_TOO_LOW);
    expect(error.getResponse()).toMatchObject({
      details: { minOrderPrice: 100 },
    });
  });

  it('최소 주문 수량보다 적으면 주문할 수 없다', () => {
    const error = errorOf(() => validateOrderRules(stock, 100n, 4n));

    expect(error.error).toBe(OrderErrors.QTY_TOO_LOW);
    expect(error.getResponse()).toMatchObject({
      details: { minOrderQty: 5 },
    });
  });
});
