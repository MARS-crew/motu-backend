import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ListingApplicationStatus } from '../../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { LISTING_DRAFT_WARNING_MS } from './listing-applications.constants.js';

const BATCH_SIZE = 100;

@Injectable()
export class ListingDraftNotificationsService {
  private readonly logger = new Logger(ListingDraftNotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** 중단 기간이 있어도 남은 기간이 7일 이하인 유효한 임시저장을 다음 주기에 안내한다. */
  async notifyExpiringDrafts() {
    const scanTime = new Date();
    let afterId = 0;
    let createdCount = 0;
    while (true) {
      const candidates = await this.prisma.listingApplication.findMany({
        where: { ...this.dueWhere(scanTime), id: { gt: afterId } },
        select: { id: true, userId: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });
      if (!candidates.length) break;
      for (const candidate of candidates) {
        afterId = candidate.id;
        try {
          const created = await this.prisma.$transaction(
            async (tx) => {
              // 임시저장 저장/삭제와 같은 회원 잠금을 사용한다. 잠금 후 최신 만료일을 재검사한다.
              const users = await tx.$queryRaw<
                { user_id: number }[]
              >`SELECT user_id FROM users WHERE user_id = ${candidate.userId} FOR UPDATE`;
              if (!users.length) return false;
              const now = new Date();
              const draft = await tx.listingApplication.findFirst({
                where: {
                  ...this.dueWhere(now),
                  id: candidate.id,
                  userId: candidate.userId,
                },
                select: {
                  id: true,
                  userId: true,
                  serviceName: true,
                  expiresAt: true,
                },
              });
              if (!draft) return false;
              const result = await this.notifications.createDraftExpiring(
                {
                  userId: draft.userId,
                  applicationId: draft.id,
                  serviceName: draft.serviceName,
                  expiresAt: draft.expiresAt,
                },
                tx,
                now,
              );
              return result.created;
            },
            { timeout: 10000 },
          );
          if (created) createdCount++;
        } catch {
          // 한 건의 실패가 뒤의 회원 안내와 기존 만료 처리를 막지 않는다. 다음 주기에 재시도한다.
          this.logger.error(
            `상장 신청 임시저장 만료 안내 실패 (applicationId=${candidate.id})`,
          );
        }
      }
      if (candidates.length < BATCH_SIZE) break;
    }
    return createdCount;
  }

  private dueWhere(now: Date) {
    return {
      status: ListingApplicationStatus.DRAFT,
      deletedDate: null,
      expiresAt: {
        gt: now,
        lte: new Date(now.getTime() + LISTING_DRAFT_WARNING_MS),
      },
    };
  }
}
