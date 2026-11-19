import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  ListingApplicationStatus,
  TradeStatus,
} from '../../generated/prisma/client.js';
import { MatchingErrors } from '../matching/matching.errors.js';
import { StockTradingService } from '../matching/stock-trading.service.js';

/** 승인된 신청서에 연결된 거래 대기 상품만 시작한다. 서버 중단 중 지난 예약도 재시작 후 처리한다. */
@Injectable()
export class ListingActivationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ListingActivationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly trading: StockTradingService,
  ) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.activateDueListings(), 5000);
    this.timer.unref();
    void this.activateDueListings();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async activateDueListings() {
    if (this.running) return;
    this.running = true;
    try {
      let cursor = 0;
      const dueAt = new Date();
      while (true) {
        const applications = await this.prisma.listingApplication.findMany({
          where: {
            id: { gt: cursor },
            deletedDate: null,
            status: ListingApplicationStatus.APPROVED,
            stock: {
              isDeleted: false,
              tradeStatus: TradeStatus.PENDING,
              listingDate: { lte: dueAt },
              listingBlockedAt: null,
            },
          },
          select: { id: true, userId: true, stockId: true },
          orderBy: { id: 'asc' },
          take: 100,
        });
        if (!applications.length) break;
        cursor = applications[applications.length - 1].id;
        for (const application of applications) {
          try {
            await this.trading.openListing(
              application.stockId!,
              application.userId,
            );
          } catch (error) {
            if (
              error instanceof BusinessException &&
              error.error.code === MatchingErrors.LISTING_NOT_PENDING.code
            )
              continue;
            if (
              error instanceof BusinessException &&
              error.error.code === MatchingErrors.ISSUER_WITHDRAWN.code
            ) {
              this.logger.warn(
                `상장 발행 보류: 신청서 ${application.id}, 상품 ${application.stockId}. 신청자 탈퇴로 자동 재시도를 중단합니다.`,
              );
              continue;
            }
            this.logger.error(
              `상장 거래 시작 실패: 신청서 ${application.id}, 상품 ${application.stockId}. 다음 주기에 재시도합니다.`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }
        if (applications.length < 100) break;
      }
    } catch (error) {
      this.logger.error(
        '상장 거래 시작 예약 조회 실패. 다음 주기에 재시도합니다.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
