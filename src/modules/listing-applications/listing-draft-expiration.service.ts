import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { LISTING_DRAFT_SWEEP_INTERVAL_MS } from './listing-applications.constants.js';
import { ListingApplicationsService } from './listing-applications.service.js';
import { ListingDraftNotificationsService } from './listing-draft-notifications.service.js';

@Injectable()
export class ListingDraftExpirationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ListingDraftExpirationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly applications: ListingApplicationsService,
    private readonly notifications: ListingDraftNotificationsService,
  ) {}

  onApplicationBootstrap() {
    // API는 주기 작업과 무관하게 expiresAt으로 만료를 즉시 판정한다.
    this.timer = setInterval(
      () => void this.sweep(),
      LISTING_DRAFT_SWEEP_INTERVAL_MS,
    );
    this.timer.unref();
    void this.sweep();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      try {
        await this.notifications.notifyExpiringDrafts();
      } catch {
        this.logger.error('상장 신청 임시저장 만료 안내 조회 실패');
      }
      try {
        await this.applications.expireDueDrafts();
      } catch {
        this.logger.error('상장 신청 임시저장 만료 처리 실패');
      }
    } finally {
      this.running = false;
    }
  }
}
