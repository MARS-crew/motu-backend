import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  Anomaly,
  AnomalyAction,
  AnomalyStatus,
  AnomalyType,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import {
  ANOMALY_ACTION_LABELS,
  ANOMALY_MAX_PERIOD_DAYS,
  ANOMALY_STATUS_LABELS,
  ANOMALY_TYPE_LABELS,
} from './anomalies.constants.js';
import { AnomalyErrors } from './anomalies.errors.js';
import {
  ANOMALY_TARGET_KEYWORD,
  GetAnomaliesReqDto,
} from './dto/req/get-anomalies-req.dto.js';
import {
  AnomalyItemResDto,
  GetAnomaliesResDto,
} from './dto/res/get-anomalies-res.dto.js';
import { GetAnomalyResDto } from './dto/res/get-anomaly-res.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 이상 거래를 처리하는 관리자 */
export interface AnomalyActor {
  adminId: number;
  client?: ClientInfo;
}

/** 상품 거래 중지·회원 상태 변경 화면에서 이상 거래를 함께 처리할 때의 대상 */
export type AnomalyActionTarget =
  | { action: typeof AnomalyAction.STOCK_PAUSE; stockId: number }
  | {
      action: typeof AnomalyAction.USER_BLOCK;
      userId: number;
      /** 바꿀 회원 상태. 정지(BLOCKED)일 때만 이상 거래를 처리할 수 있다. */
      userStatus: UserStatus;
    };

const listInclude = {
  stock: { select: { name: true, stockCode: true } },
  user: { select: { loginId: true, nickname: true } },
} satisfies Prisma.AnomalyInclude;

const detailInclude = {
  ...listInclude,
  handledBy: { select: { loginId: true } },
} satisfies Prisma.AnomalyInclude;

type AnomalyWithNames = Prisma.AnomalyGetPayload<{
  include: typeof listInclude;
}>;
type AnomalyDetail = Prisma.AnomalyGetPayload<{
  include: typeof detailInclude;
}>;

/** 관리자 거래 모니터링 (ADM-MON-01·02). 탐지는 AnomalyDetectorService가 한다. */
@Injectable()
export class AnomaliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminActivityLogs: AdminActivityLogsService,
  ) {}

  /** 이상 거래 목록. 최신 발생순이고, 상단 건수는 같은 조건으로 센다. */
  async getAnomalies(query: GetAnomaliesReqDto): Promise<GetAnomaliesResDto> {
    const where = this.toWhere(query);
    const [anomalies, groups] = await this.prisma.$transaction([
      this.prisma.anomaly.findMany({
        where,
        include: listInclude,
        orderBy: [{ detectedDate: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.size,
        take: query.size,
      }),
      this.prisma.anomaly.groupBy({
        by: ['type', 'status'],
        where,
        orderBy: [{ type: 'asc' }, { status: 'asc' }],
        _count: { _all: true },
      }),
    ]);

    const typeCounts = Object.fromEntries(
      Object.values(AnomalyType).map((type) => [type, 0]),
    ) as Record<AnomalyType, number>;
    let totalCount = 0;
    let pendingCount = 0;
    for (const group of groups) {
      const count = (group._count as { _all: number })._all;
      typeCounts[group.type] += count;
      totalCount += count;
      if (group.status === AnomalyStatus.PENDING) {
        pendingCount += count;
      }
    }

    return {
      items: anomalies.map((anomaly) => this.toItem(anomaly)),
      page: query.page,
      size: query.size,
      totalCount,
      summary: { totalCount, pendingCount, typeCounts },
    };
  }

  /** 탐지 정보·근거와 처리 결과를 포함한 상세. 조회만으로 처리 상태를 바꾸지 않는다. */
  async getAnomaly(anomalyId: number): Promise<GetAnomalyResDto> {
    const anomaly = await this.prisma.anomaly.findUnique({
      where: { id: anomalyId },
      include: detailInclude,
    });
    if (!anomaly) {
      throw new BusinessException(AnomalyErrors.NOT_FOUND);
    }
    return this.toDetail(anomaly);
  }

  /**
   * [조치 내용 확인]: 상품 거래 중지·회원 정지 화면으로 넘어가며 확인중으로 바꾼다.
   * 그 화면에서 확정하면 처리완료가 되고, 취소하면 확인중으로 남는다.
   */
  async review(
    anomalyId: number,
    action: AnomalyAction,
    adminId: number,
  ): Promise<GetAnomalyResDto> {
    const anomaly = await this.findAnomaly(anomalyId);
    this.assertOpen(anomaly);
    if (action === AnomalyAction.NO_ISSUE) {
      throw new BusinessException(AnomalyErrors.INVALID_ACTION);
    }
    // 예약 포인트 불일치처럼 상품이 없는 이상 거래는 거래 중지할 상품이 없다.
    if (action === AnomalyAction.STOCK_PAUSE && anomaly.stockId === null) {
      throw new BusinessException(AnomalyErrors.TARGET_MISMATCH);
    }

    const { count } = await this.prisma.anomaly.updateMany({
      where: { id: anomalyId, status: { not: AnomalyStatus.RESOLVED } },
      data: {
        status: AnomalyStatus.REVIEWING,
        action,
        handledById: adminId,
        handledDate: new Date(),
      },
    });
    if (count === 0) {
      throw new BusinessException(AnomalyErrors.ALREADY_RESOLVED);
    }
    return this.getAnomaly(anomalyId);
  }

  /** 이상 없음: 이 화면의 확인 모달에서 바로 처리완료한다. */
  async dismiss(
    anomalyId: number,
    reason: string,
    actor: AnomalyActor,
  ): Promise<GetAnomalyResDto> {
    const anomaly = await this.findAnomaly(anomalyId);
    this.assertOpen(anomaly);
    await this.prisma.$transaction((tx) =>
      this.resolve(tx, anomaly, AnomalyAction.NO_ISSUE, reason, actor),
    );
    return this.getAnomaly(anomalyId);
  }

  /**
   * 상품 거래 중지·회원 정지를 실행하기 전에, 함께 처리할 이상 거래가 그 대상의 것인지 확인한다.
   * 거래 중지는 미체결 주문을 취소하므로 처리에 들어가기 전에 막는다.
   */
  async assertActionable(
    anomalyId: number,
    target: AnomalyActionTarget,
  ): Promise<Anomaly> {
    if (
      target.action === AnomalyAction.USER_BLOCK &&
      target.userStatus !== UserStatus.BLOCKED
    ) {
      throw new BusinessException(AnomalyErrors.INVALID_ACTION);
    }
    const anomaly = await this.findAnomaly(anomalyId);
    this.assertOpen(anomaly);
    const matches =
      target.action === AnomalyAction.STOCK_PAUSE
        ? anomaly.stockId === target.stockId
        : anomaly.userId === target.userId;
    if (!matches) {
      throw new BusinessException(AnomalyErrors.TARGET_MISMATCH);
    }
    return anomaly;
  }

  /**
   * 상품 거래 중지·회원 정지와 같은 트랜잭션에서 이상 거래를 처리완료한다.
   * 그 사이 다른 관리자가 먼저 처리했으면 ANOMALY_ALREADY_RESOLVED로 거래 중지·정지까지 롤백한다.
   */
  async resolve(
    tx: Prisma.TransactionClient,
    anomaly: Anomaly,
    action: AnomalyAction,
    reason: string,
    actor: AnomalyActor,
  ): Promise<void> {
    // 확인 시점과 처리 시점 사이에 다른 관리자가 처리했는지 조건부 갱신으로 확인한다.
    const { count } = await tx.anomaly.updateMany({
      where: { id: anomaly.id, status: { not: AnomalyStatus.RESOLVED } },
      data: {
        status: AnomalyStatus.RESOLVED,
        action,
        actionReason: reason,
        handledById: actor.adminId,
        handledDate: new Date(),
      },
    });
    if (count === 0) {
      throw new BusinessException(AnomalyErrors.ALREADY_RESOLVED);
    }

    await this.adminActivityLogs.record(
      {
        adminId: actor.adminId,
        targetType: AdminActivityTarget.ANOMALY,
        targetId: anomaly.id,
        targetLabel: ANOMALY_TYPE_LABELS[anomaly.type],
        action: AdminActivityAction.ANOMALY_ACTION,
        summary: `${ANOMALY_STATUS_LABELS[anomaly.status]} → ${ANOMALY_STATUS_LABELS[AnomalyStatus.RESOLVED]} (${ANOMALY_ACTION_LABELS[action]})`,
        before: { status: anomaly.status, action: anomaly.action },
        after: { status: AnomalyStatus.RESOLVED, action },
        reason,
        client: actor.client,
      },
      tx,
    );
  }

  private async findAnomaly(anomalyId: number): Promise<Anomaly> {
    const anomaly = await this.prisma.anomaly.findUnique({
      where: { id: anomalyId },
    });
    if (!anomaly) {
      throw new BusinessException(AnomalyErrors.NOT_FOUND);
    }
    return anomaly;
  }

  private assertOpen(anomaly: Anomaly): void {
    if (anomaly.status === AnomalyStatus.RESOLVED) {
      throw new BusinessException(AnomalyErrors.ALREADY_RESOLVED);
    }
  }

  private toWhere(query: GetAnomaliesReqDto): Prisma.AnomalyWhereInput {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (
      from &&
      to &&
      (from >= to ||
        to.getTime() - from.getTime() > ANOMALY_MAX_PERIOD_DAYS * DAY_MS)
    ) {
      throw new BusinessException(AnomalyErrors.INVALID_PERIOD);
    }

    return {
      type: query.type,
      status: query.status,
      detectedDate: from || to ? { gte: from, lt: to } : undefined,
      ...this.keywordWhere(query.keyword),
    };
  }

  /** PRD-018은 상품, USR-1024는 회원, 숫자만 있으면 둘 다에서 찾는다. */
  private keywordWhere(keyword?: string): Prisma.AnomalyWhereInput {
    const match = keyword ? ANOMALY_TARGET_KEYWORD.exec(keyword) : null;
    if (!match) {
      return {};
    }
    const id = Number(match[2]);
    switch (match[1]?.toUpperCase()) {
      case 'PRD':
        return { stockId: id };
      case 'USR':
        return { userId: id };
      default:
        return { OR: [{ stockId: id }, { userId: id }] };
    }
  }

  private toItem(anomaly: AnomalyWithNames): AnomalyItemResDto {
    return {
      anomalyId: anomaly.id,
      type: anomaly.type,
      status: anomaly.status,
      detectedDate: anomaly.detectedDate,
      stockId: anomaly.stockId,
      stockName: anomaly.stock?.name ?? null,
      userId: anomaly.userId,
      loginId: anomaly.user.loginId,
      errorCode: anomaly.errorCode,
      errorMessage: anomaly.errorMessage,
    };
  }

  private toDetail(anomaly: AnomalyDetail): GetAnomalyResDto {
    return {
      ...this.toItem(anomaly),
      stockCode: anomaly.stock?.stockCode ?? null,
      nickname: anomaly.user.nickname,
      orderId: anomaly.orderId === null ? null : Number(anomaly.orderId),
      tradeId: anomaly.tradeId === null ? null : Number(anomaly.tradeId),
      evidence: anomaly.evidence as Record<string, unknown>,
      action: anomaly.action,
      actionReason: anomaly.actionReason,
      handledBy:
        anomaly.handledById !== null && anomaly.handledBy
          ? { adminId: anomaly.handledById, loginId: anomaly.handledBy.loginId }
          : null,
      handledDate: anomaly.handledDate,
    };
  }
}
