import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import { maskIpAddress } from '../../common/utils/masking.js';
import {
  AdminActivityAction,
  AdminActivityLog,
  AdminActivityResult,
  AdminActivityTarget,
  Prisma,
} from '../../generated/prisma/client.js';
import {
  ACTIONS_BY_TARGET,
  ADMIN_ACTIVITY_LOG_MAX_PERIOD_DAYS,
} from './admin-activity-logs.constants.js';
import { AdminActivityLogErrors } from './admin-activity-logs.errors.js';
import { GetAdminActivityLogsReqDto } from './dto/req/get-admin-activity-logs-req.dto.js';
import { GetAdminActivityLogResDto } from './dto/res/get-admin-activity-log-res.dto.js';
import {
  AdminActivityLogItemResDto,
  GetAdminActivityLogsResDto,
} from './dto/res/get-admin-activity-logs-res.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 관리자 활동 이력 한 건. 다른 도메인이 관리자 처리를 마칠 때 남긴다. */
export interface RecordAdminActivity {
  /** 처리한 관리자 user_id */
  adminId: number;
  targetType: AdminActivityTarget;
  targetId: number | bigint;
  /** 처리 당시 대상 이름 (상품명, 아이디, 공지 제목 등) */
  targetLabel?: string;
  /** targetType에서 할 수 있는 작업이어야 한다 (ACTIONS_BY_TARGET) */
  action: AdminActivityAction;
  result?: AdminActivityResult;
  /** 목록에 보여줄 변경 요약. 예) 거래 가능 → 거래 중지 */
  summary?: string;
  /** 변경 전·후 값 { 항목: 값 }. 바뀐 항목만 넣는다. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  client?: ClientInfo;
}

type LogWithAdmin = AdminActivityLog & { admin: { loginId: string } };

@Injectable()
export class AdminActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 관리자 활동 이력을 남긴다. 처리와 함께 롤백되도록 처리 중인 트랜잭션(tx)을 넘긴다.
   *
   * 예) await this.adminActivityLogs.record({ adminId, targetType: STOCK, targetId, action: STOCK_PAUSE, ... }, tx)
   */
  async record(
    activity: RecordAdminActivity,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (!ACTIONS_BY_TARGET[activity.targetType].includes(activity.action)) {
      // 호출하는 코드의 실수이므로 사용자 에러가 아니라 서버 에러로 둔다.
      throw new Error(
        `${activity.targetType}에서 ${activity.action}을 기록할 수 없습니다.`,
      );
    }

    await tx.adminActivityLog.create({
      data: {
        adminId: activity.adminId,
        targetType: activity.targetType,
        targetId: BigInt(activity.targetId),
        targetLabel: activity.targetLabel?.slice(0, 100),
        action: activity.action,
        result: activity.result,
        summary: activity.summary?.slice(0, 200),
        beforeValue: activity.before as Prisma.InputJsonValue | undefined,
        afterValue: activity.after as Prisma.InputJsonValue | undefined,
        reason: activity.reason?.slice(0, 500),
        ipAddress: activity.client?.ipAddress?.slice(0, 45),
        userAgent: activity.client?.userAgent?.slice(0, 255),
      },
    });
  }

  /** 관리자 활동 이력 목록. 최신순이다. */
  async getLogs(
    query: GetAdminActivityLogsReqDto,
  ): Promise<GetAdminActivityLogsResDto> {
    const where = this.toWhere(query);
    const [logs, totalCount] = await this.prisma.$transaction([
      this.prisma.adminActivityLog.findMany({
        where,
        include: { admin: { select: { loginId: true } } },
        orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.size,
        take: query.size,
      }),
      this.prisma.adminActivityLog.count({ where }),
    ]);

    return {
      items: logs.map((log) => this.toItem(log)),
      page: query.page,
      size: query.size,
      totalCount,
    };
  }

  /** 변경 전·후 값과 사유를 포함한 상세 */
  async getLog(activityLogId: number): Promise<GetAdminActivityLogResDto> {
    const log = await this.prisma.adminActivityLog.findUnique({
      where: { id: BigInt(activityLogId) },
      include: { admin: { select: { loginId: true } } },
    });
    if (!log) {
      throw new BusinessException(AdminActivityLogErrors.NOT_FOUND);
    }

    return {
      ...this.toItem(log),
      before: (log.beforeValue as Record<string, unknown> | null) ?? null,
      after: (log.afterValue as Record<string, unknown> | null) ?? null,
      reason: log.reason,
      ipAddress: log.ipAddress ? maskIpAddress(log.ipAddress) : null,
    };
  }

  private toWhere(
    query: GetAdminActivityLogsReqDto,
  ): Prisma.AdminActivityLogWhereInput {
    if (query.targetId !== undefined && !query.targetType) {
      throw new BusinessException(AdminActivityLogErrors.TARGET_TYPE_REQUIRED);
    }
    if (
      query.targetType &&
      query.action &&
      !ACTIONS_BY_TARGET[query.targetType].includes(query.action)
    ) {
      throw new BusinessException(
        AdminActivityLogErrors.ACTION_TARGET_MISMATCH,
      );
    }

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (
      from &&
      to &&
      (from >= to ||
        to.getTime() - from.getTime() >
          ADMIN_ACTIVITY_LOG_MAX_PERIOD_DAYS * DAY_MS)
    ) {
      throw new BusinessException(AdminActivityLogErrors.INVALID_PERIOD);
    }

    return {
      admin: query.adminLoginId
        ? { loginId: { contains: query.adminLoginId } }
        : undefined,
      targetType: query.targetType,
      targetId:
        query.targetId !== undefined ? BigInt(query.targetId) : undefined,
      action: query.action,
      createDate: from || to ? { gte: from, lt: to } : undefined,
    };
  }

  private toItem(log: LogWithAdmin): AdminActivityLogItemResDto {
    return {
      activityLogId: Number(log.id),
      createDate: log.createDate,
      adminId: log.adminId,
      adminLoginId: log.admin.loginId,
      targetType: log.targetType,
      targetId: Number(log.targetId),
      targetLabel: log.targetLabel,
      action: log.action,
      result: log.result,
      summary: log.summary,
    };
  }
}
