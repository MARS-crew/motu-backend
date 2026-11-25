import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { UserStatus, type Prisma } from '../../generated/prisma/client.js';
import { AuthErrors } from '../auth/auth.errors.js';
import type { UpdateNotificationSettingsReqDto } from './dto/req/update-notification-settings-req.dto.js';
import type { NotificationSettingsResDto } from './dto/res/notification-settings-res.dto.js';
import { NotificationSettingsErrors as Errors } from './notification-settings.errors.js';
import {
  evaluatePushDelivery,
  PUSH_NIGHT_WINDOW,
  type PushDeliveryDecision,
  type PushPreferences,
} from './push-delivery.policy.js';

const select = {
  isPushEnabled: true,
  nightPushEnabled: true,
  userStatus: true,
  isDeleted: true,
} as const satisfies Prisma.UserSelect;
type SettingsUser = Prisma.UserGetPayload<{ select: typeof select }>;

@Injectable()
export class NotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: number): Promise<NotificationSettingsResDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select,
    });
    this.assertActive(user);
    return this.response(user!);
  }

  async update(
    userId: number,
    dto: UpdateNotificationSettingsReqDto,
  ): Promise<NotificationSettingsResDto> {
    if (dto.isPushEnabled === undefined && dto.nightPushEnabled === undefined) {
      throw new BusinessException(Errors.NOTHING_TO_UPDATE);
    }
    return this.prisma.$transaction(async (tx) => {
      // 같은 회원의 설정 변경과 탈퇴·정지를 직렬화하며 회원 FK 확인은 불필요하게 막지 않는다.
      await tx.$queryRaw`SELECT user_id FROM users WHERE user_id=${userId} FOR NO KEY UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId }, select });
      this.assertActive(user);
      const enabled = dto.isPushEnabled ?? user!.isPushEnabled;
      if (dto.nightPushEnabled !== undefined && !enabled) {
        throw new BusinessException(Errors.NIGHT_REQUIRES_PUSH);
      }
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.isPushEnabled !== undefined
            ? { isPushEnabled: dto.isPushEnabled }
            : {}),
          ...(dto.nightPushEnabled !== undefined
            ? { nightPushEnabled: dto.nightPushEnabled }
            : {}),
        },
        select,
      });
      return this.response(updated);
    });
  }

  /** 푸시 발송기에서 전송 직전에 호출한다. tx 생략 시 최신 커밋값을 읽으며 결과를 캐시하지 않는다. */
  async getPushDecision(
    userId: number,
    at = new Date(),
    tx?: Prisma.TransactionClient,
  ): Promise<PushDeliveryDecision> {
    if (!Number.isSafeInteger(userId) || userId <= 0 || userId > 2147483647) {
      return { allowed: false, reason: 'USER_UNAVAILABLE' };
    }
    const user = await (tx ?? this.prisma).user.findUnique({
      where: { id: userId },
      select,
    });
    if (!user || user.isDeleted || user.userStatus !== UserStatus.ACTIVE) {
      return { allowed: false, reason: 'USER_UNAVAILABLE' };
    }
    return evaluatePushDelivery(user, at);
  }

  private assertActive(user: SettingsUser | null) {
    if (user?.userStatus === UserStatus.LOCKED) {
      throw new BusinessException(AuthErrors.ACCOUNT_LOCKED);
    }
    if (user?.userStatus === UserStatus.BLOCKED) {
      throw new BusinessException(AuthErrors.ACCOUNT_BLOCKED);
    }
    if (!user || user.isDeleted || user.userStatus !== UserStatus.ACTIVE) {
      throw new BusinessException(AuthErrors.UNAUTHORIZED);
    }
  }

  private response(user: PushPreferences): NotificationSettingsResDto {
    return {
      ...PUSH_NIGHT_WINDOW,
      isPushEnabled: user.isPushEnabled,
      nightPushEnabled: user.nightPushEnabled,
      canChangeNightPush: user.isPushEnabled,
    };
  }
}
