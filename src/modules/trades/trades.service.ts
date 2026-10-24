import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { OrderSide } from '../../generated/prisma/client.js';
import { StockErrors } from '../stocks/stocks.errors.js';
import { GetRecentTradesResDto } from './dto/res/get-recent-trades-res.dto.js';
import { RECENT_TRADES_COUNT } from './trades.constants.js';

@Injectable()
export class TradesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 그 종목의 최근 체결. 최신순이다.
   */
  async getRecentTrades(stockId: number): Promise<GetRecentTradesResDto> {
    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, isDeleted: false },
      select: { id: true },
    });
    if (!stock) {
      throw new BusinessException(StockErrors.NOT_FOUND);
    }

    // 한 주문의 체결은 같은 시각에 저장되므로 같은 시각이면 체결 ID 순서로 정렬한다.
    const trades = await this.prisma.trade.findMany({
      where: { stockId: stock.id },
      orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
      take: RECENT_TRADES_COUNT,
    });

    return {
      stockId: stock.id,
      items: trades.map((trade) => ({
        tradeId: Number(trade.id),
        price: Number(trade.price),
        qty: Number(trade.qty),
        // 나중에 들어온 주문(ID가 큰 쪽)이 체결을 일으킨 쪽이다.
        side:
          trade.buyOrderId > trade.sellOrderId ? OrderSide.BUY : OrderSide.SELL,
        createDate: trade.createDate,
      })),
    };
  }
}
