import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminActivityAction,
  AdminActivityResult,
  AdminActivityTarget,
  InitialPointSetting,
  Prisma,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { GetInitialGrantHistoryReqDto } from './dto/req/get-initial-grant-history-req.dto.js';
import { UpdateInitialGrantReqDto } from './dto/req/update-initial-grant-req.dto.js';
import { GetInitialGrantHistoryResDto } from './dto/res/get-initial-grant-history-res.dto.js';
import { InitialGrantResDto } from './dto/res/initial-grant-res.dto.js';
import { PointSettingsErrors } from './point-settings.errors.js';

const SETTING_ID = 1;

@Injectable()
export class PointSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: AdminActivityLogsService,
  ) {}

  async getInitialGrant(): Promise<InitialGrantResDto> {
    // migration으로 준비한다. 누락 시 기본값을 조용히 지급하거나 조회 중 재생성하지 않는다.
    return this.toResponse(
      await this.prisma.initialPointSetting.findUniqueOrThrow({
        where: { id: SETTING_ID },
      }),
    );
  }

  /** 가입과 같은 트랜잭션에서 공유 잠금을 유지한다. 여러 가입은 병렬, 설정 변경은 기다린다. */
  async getSignupGrant(tx: Prisma.TransactionClient): Promise<bigint> {
    const [setting] = await tx.$queryRaw<{ amount: bigint }[]>`
      SELECT amount FROM initial_point_settings WHERE setting_id = ${SETTING_ID} FOR SHARE
    `;
    if (!setting) {
      throw new Error(
        '신규 가입 지급액 설정이 없습니다. 마이그레이션 적용을 확인해 주세요.',
      );
    }
    return setting.amount;
  }

  async updateInitialGrant(
    dto: UpdateInitialGrantReqDto,
    actor: { adminId: number; client?: ClientInfo },
  ): Promise<InitialGrantResDto> {
    return this.prisma.$transaction(
      async (tx) => {
        // FOR SHARE와 충돌하는 UPDATE 잠금이어야 가입 완료와 설정 변경의 선후가 명확하다.
        await tx.$queryRaw`
        SELECT setting_id FROM initial_point_settings WHERE setting_id = ${SETTING_ID} FOR UPDATE
      `;
        const before = await tx.initialPointSetting.findUniqueOrThrow({
          where: { id: SETTING_ID },
        });
        if (before.version !== dto.expectedVersion) {
          throw new BusinessException(PointSettingsErrors.CONCURRENT_UPDATE);
        }
        // 같은 금액의 저장은 변경이 아니므로 버전과 이력을 늘리지 않는다.
        if (before.amount === BigInt(dto.amount)) {
          return this.toResponse(before);
        }
        const after = await tx.initialPointSetting.update({
          where: { id: SETTING_ID },
          data: {
            amount: BigInt(dto.amount),
            version: { increment: 1 },
            modifiedDate: new Date(),
          },
        });
        await this.activities.record(
          {
            adminId: actor.adminId,
            targetType: AdminActivityTarget.POINT_SETTING,
            targetId: SETTING_ID,
            targetLabel: '신규 가입 초기 지급 포인트',
            action: AdminActivityAction.INITIAL_GRANT_UPDATE,
            summary: `${before.amount.toLocaleString('ko-KR')}P → ${after.amount.toLocaleString('ko-KR')}P`,
            before: { amount: Number(before.amount), version: before.version },
            after: { amount: Number(after.amount), version: after.version },
            reason: dto.reason,
            client: actor.client,
          },
          tx,
        );
        return this.toResponse(after);
      },
      { timeout: 15_000 },
    );
  }

  async getHistory({
    page,
    size,
  }: GetInitialGrantHistoryReqDto): Promise<GetInitialGrantHistoryResDto> {
    const where: Prisma.AdminActivityLogWhereInput = {
      targetType: AdminActivityTarget.POINT_SETTING,
      targetId: SETTING_ID,
      action: AdminActivityAction.INITIAL_GRANT_UPDATE,
      result: AdminActivityResult.SUCCESS,
    };
    const [logs, totalCount] = await this.prisma.$transaction(
      [
        this.prisma.adminActivityLog.findMany({
          where,
          include: { admin: { select: { loginId: true } } },
          orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * size,
          take: size,
        }),
        this.prisma.adminActivityLog.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: logs.map((log) => {
        const before = log.beforeValue as { amount: number; version: number };
        const after = log.afterValue as { amount: number; version: number };
        return {
          activityLogId: Number(log.id),
          beforeAmount: before.amount,
          afterAmount: after.amount,
          beforeVersion: before.version,
          afterVersion: after.version,
          reason: log.reason!,
          adminId: log.adminId,
          adminLoginId: log.admin.loginId,
          createDate: log.createDate,
        };
      }),
      page,
      size,
      totalCount,
    };
  }

  private toResponse(setting: InitialPointSetting): InitialGrantResDto {
    return {
      amount: Number(setting.amount),
      version: setting.version,
      modifiedDate: setting.modifiedDate,
    };
  }
}
