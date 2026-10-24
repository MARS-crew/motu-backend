import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  OrderSide,
  OrderStatus,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { AccountErrors } from '../accounts/accounts.errors.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { MatchingErrors } from './matching.errors.js';
import { MatchingService } from './matching.service.js';
import { SettlementService } from './settlement.js';
import { StockTradingService } from './stock-trading.service.js';

const STOCK_ID = 7;
const ISSUER_USER_ID = 30;
const ISSUER_ACCOUNT_ID = 3;

describe('StockTradingService', () => {
  const tx = {
    stock: { findFirst: vi.fn(), update: vi.fn() },
    account: { findUnique: vi.fn(), update: vi.fn() },
    holding: { create: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  };
  const transaction = vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
    fn(tx),
  );
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const matching = {
    runExclusive: vi.fn((_: number, task: () => Promise<unknown>) => task()),
    apply: vi.fn(),
    clearBook: vi.fn(),
  };
  const settlement = { lockAccounts: vi.fn() };
  const service = new StockTradingService(
    prisma,
    matching as unknown as MatchingService,
    settlement as unknown as SettlementService,
  );

  const errorOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as BusinessException;
    }
    throw new Error('예외가 발생하지 않았습니다.');
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('openListing', () => {
    beforeEach(() => {
      tx.stock.findFirst.mockResolvedValue({
        id: STOCK_ID,
        tradeStatus: TradeStatus.PENDING,
        listedShares: 1_000n,
        basePrice: 5_000n,
      });
      tx.account.findUnique.mockResolvedValue({ id: ISSUER_ACCOUNT_ID });
      tx.order.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 500n,
          filledQty: 0n,
          lockedAmount: 0n,
          status: OrderStatus.ACCEPTED,
          ...data,
        }),
      );
    });

    it('신청자에게 발행 주식 전량을 주고 상장가에 전량 매도 주문을 건 뒤 거래를 시작한다', async () => {
      const result = await service.openListing(STOCK_ID, ISSUER_USER_ID);

      expect(matching.runExclusive).toHaveBeenCalledWith(
        STOCK_ID,
        expect.any(Function),
      );
      expect(tx.account.findUnique).toHaveBeenCalledWith({
        where: { userId: ISSUER_USER_ID },
      });
      expect(tx.holding.create).toHaveBeenCalledWith({
        data: {
          accountId: ISSUER_ACCOUNT_ID,
          stockId: STOCK_ID,
          qty: 1_000n,
          lockedQty: 1_000n,
          totalAmount: 5_000_000n,
        },
      });
      expect(tx.order.create).toHaveBeenCalledWith({
        data: {
          accountId: ISSUER_ACCOUNT_ID,
          stockId: STOCK_ID,
          clientOrderId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          ),
          side: OrderSide.SELL,
          price: 5_000n,
          qty: 1_000n,
        },
      });
      expect(tx.stock.update).toHaveBeenCalledWith({
        where: { id: STOCK_ID },
        data: { tradeStatus: TradeStatus.ACTIVE },
      });
      expect(result).toEqual({ orderId: 500n });
    });

    it('커밋한 뒤에 상장 매도 주문을 호가창에 올린다', async () => {
      await service.openListing(STOCK_ID, ISSUER_USER_ID);

      expect(matching.apply).toHaveBeenCalledWith(
        STOCK_ID,
        expect.objectContaining({ id: 500n, side: OrderSide.SELL }),
        [],
      );
      expect(matching.apply.mock.invocationCallOrder[0]).toBeGreaterThan(
        tx.stock.update.mock.invocationCallOrder[0],
      );
    });

    it('거래 대기 상태가 아니면 상장할 수 없다', async () => {
      tx.stock.findFirst.mockResolvedValue({
        id: STOCK_ID,
        tradeStatus: TradeStatus.ACTIVE,
        listedShares: 1_000n,
        basePrice: 5_000n,
      });

      const error = await errorOf(
        service.openListing(STOCK_ID, ISSUER_USER_ID),
      );

      expect(error.error).toBe(MatchingErrors.LISTING_NOT_PENDING);
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(matching.apply).not.toHaveBeenCalled();
    });

    it('없거나 삭제된 상품이면 상장할 수 없다', async () => {
      tx.stock.findFirst.mockResolvedValue(null);

      const error = await errorOf(
        service.openListing(STOCK_ID, ISSUER_USER_ID),
      );

      expect(error.error).toBe(StockErrors.NOT_FOUND);
      expect(tx.stock.findFirst).toHaveBeenCalledWith({
        where: { id: STOCK_ID, isDeleted: false },
      });
    });

    it('신청자의 계좌가 없으면 상장할 수 없다', async () => {
      tx.account.findUnique.mockResolvedValue(null);

      const error = await errorOf(
        service.openListing(STOCK_ID, ISSUER_USER_ID),
      );

      expect(error.error).toBe(AccountErrors.NOT_FOUND);
      expect(tx.holding.create).not.toHaveBeenCalled();
    });
  });

  describe('closeStock', () => {
    const openOrderOf = (
      id: bigint,
      accountId: number,
      side: OrderSide,
      qty: bigint,
      filledQty: bigint,
      lockedAmount: bigint,
    ) => ({ id, accountId, side, qty, filledQty, lockedAmount });

    beforeEach(() => {
      tx.stock.findFirst.mockResolvedValue({
        id: STOCK_ID,
        tradeStatus: TradeStatus.ACTIVE,
      });
    });

    it('미체결 주문의 예약을 계좌별로 풀고 모두 취소한 뒤 거래를 종료한다', async () => {
      tx.order.findMany.mockResolvedValue([
        openOrderOf(1n, 5, OrderSide.BUY, 10n, 0n, 50_000n),
        openOrderOf(2n, 5, OrderSide.BUY, 5n, 2n, 15_000n),
        openOrderOf(3n, 2, OrderSide.BUY, 1n, 0n, 4_900n),
        openOrderOf(4n, 3, OrderSide.SELL, 10n, 4n, 0n),
        openOrderOf(5n, 3, OrderSide.SELL, 2n, 0n, 0n),
      ]);

      const result = await service.closeStock(STOCK_ID);

      expect(tx.order.findMany).toHaveBeenCalledWith({
        where: {
          stockId: STOCK_ID,
          status: { in: [OrderStatus.ACCEPTED, OrderStatus.PARTIAL] },
        },
      });
      expect(settlement.lockAccounts).toHaveBeenCalledWith(tx, [5, 5, 2]);
      expect(tx.account.update.mock.calls.map(([args]) => args)).toEqual([
        {
          where: { id: 5 },
          data: {
            lockedCash: { decrement: 65_000n },
            version: { increment: 1 },
          },
        },
        {
          where: { id: 2 },
          data: {
            lockedCash: { decrement: 4_900n },
            version: { increment: 1 },
          },
        },
      ]);
      expect(tx.holding.update).toHaveBeenCalledWith({
        where: { accountId_stockId: { accountId: 3, stockId: STOCK_ID } },
        data: { lockedQty: { decrement: 8n } },
      });
      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1n, 2n, 3n, 4n, 5n] } },
        data: {
          status: OrderStatus.CANCELED,
          lockedAmount: 0n,
          canceledDate: expect.any(Date),
        },
      });
      expect(tx.stock.update).toHaveBeenCalledWith({
        where: { id: STOCK_ID },
        data: { tradeStatus: TradeStatus.CLOSED },
      });
      expect(result).toEqual({ canceledCount: 5 });
    });

    it('커밋한 뒤에 호가창을 비운다', async () => {
      tx.order.findMany.mockResolvedValue([]);

      await service.closeStock(STOCK_ID);

      expect(matching.runExclusive).toHaveBeenCalledWith(
        STOCK_ID,
        expect.any(Function),
      );
      expect(matching.clearBook).toHaveBeenCalledWith(STOCK_ID);
      expect(matching.clearBook.mock.invocationCallOrder[0]).toBeGreaterThan(
        tx.stock.update.mock.invocationCallOrder[0],
      );
    });

    it('미체결 주문이 없으면 계좌를 잠그거나 주문을 바꾸지 않고 거래만 종료한다', async () => {
      tx.order.findMany.mockResolvedValue([]);

      const result = await service.closeStock(STOCK_ID);

      expect(settlement.lockAccounts).not.toHaveBeenCalled();
      expect(tx.order.updateMany).not.toHaveBeenCalled();
      expect(tx.stock.update).toHaveBeenCalled();
      expect(result).toEqual({ canceledCount: 0 });
    });

    it('없거나 삭제된 상품이면 종료할 수 없다', async () => {
      tx.stock.findFirst.mockResolvedValue(null);

      const error = await errorOf(service.closeStock(STOCK_ID));

      expect(error.error).toBe(StockErrors.NOT_FOUND);
      expect(matching.clearBook).not.toHaveBeenCalled();
    });
  });
});
