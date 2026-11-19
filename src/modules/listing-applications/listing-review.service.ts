import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminActivityAction as Action,
  AdminActivityTarget,
  ListingApplicationStatus as Status,
  Prisma,
  TradeStatus,
} from '../../generated/prisma/client.js';
import type { ListingApplication } from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import { FilesService } from '../files/files.service.js';
import { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';
import type {
  ApproveListingReqDto,
  ExtendListingRevisionDeadlineReqDto,
  RequestListingRevisionReqDto,
} from './dto/req/review-listing-req.dto.js';
import { ListingApplicationErrors } from './listing-applications.errors.js';
import { ListingReviewErrors as Errors } from './listing-review.errors.js';
import { ListingStepValidationService } from './listing-step-validation.service.js';
import { validateListingStepFields } from './listing-steps.validation.js';
import { lockListingIssuer } from '../matching/listing-issuer.js';
import { MatchingErrors } from '../matching/matching.errors.js';
import { LISTING_STATUS_LABELS } from './listing-applications.constants.js';
import { StockCodesService } from '../stocks/stock-codes.service.js';

export interface ListingReviewActor {
  adminId: number;
  client?: ClientInfo;
}
const BIGINT_MAX = 9223372036854775807n;
const kstDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;

@Injectable()
export class ListingReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: AdminActivityLogsService,
    private readonly steps: ListingStepValidationService,
    private readonly files: FilesService,
    private readonly stockCodes: StockCodesService,
  ) {}

  start(id: number, actor: ListingReviewActor) {
    return this.prisma.$transaction(async (tx) => {
      const app = await this.lock(tx, id, Status.SUBMITTED);
      const updated = await tx.listingApplication.update({
        where: { id },
        data: { status: Status.UNDER_REVIEW },
      });
      await this.record(tx, app, updated, Action.LISTING_REVIEW_START, actor);
      return this.result(updated);
    });
  }

  requestRevision(
    id: number,
    dto: RequestListingRevisionReqDto,
    actor: ListingReviewActor,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const app = await this.lock(tx, id, Status.UNDER_REVIEW);
        this.deadline(dto.deadline);
        const data = app.draftData as ListingDraftDataReqDto;
        const attachments = await this.steps.getAttachments(
          app.userId,
          data,
          tx,
        );
        for (const collection of Object.values(attachments)) {
          if (collection)
            await this.files.freezeSavedCollection(
              app.userId,
              collection.id,
              tx,
            );
        }
        // 첨부 잠금을 기다린 시간도 포함해 반영 직전에 미래 기한을 재검사한다.
        const deadline = this.deadline(dto.deadline);
        const revision = await tx.listingApplicationRevision.create({
          data: {
            applicationId: id,
            requestedById: actor.adminId,
            requestItems: dto.requestItems,
            requestContent: dto.requestContent,
            deadline,
            previousData: json({ ...json(data), _attachments: attachments }),
            deadlineHistory: json([
              {
                deadline: deadline.toISOString(),
                adminId: actor.adminId,
                changedAt: new Date().toISOString(),
                reason: '최초 지정',
              },
            ]),
          },
        });
        const updated = await tx.listingApplication.update({
          where: { id },
          data: {
            status: Status.REVISION_REQUESTED,
            reviewComment: dto.requestContent,
            revisionDeadline: deadline,
          },
        });
        await this.record(
          tx,
          app,
          updated,
          Action.LISTING_REVISION_REQUEST,
          actor,
          dto.requestContent,
          {
            revisionId: revision.id,
            requestItems: dto.requestItems,
            requestContent: dto.requestContent,
            deadline: deadline.toISOString(),
          },
        );
        return this.result(updated, revision.id);
      },
      { timeout: 15000 },
    );
  }

  extendDeadline(
    id: number,
    revisionId: number,
    dto: ExtendListingRevisionDeadlineReqDto,
    actor: ListingReviewActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const app = await this.lock(tx, id, Status.REVISION_REQUESTED);
      const revision = await tx.listingApplicationRevision.findFirst({
        where: { id: revisionId, applicationId: id, resubmittedAt: null },
      });
      if (!revision) throw new BusinessException(Errors.STATE);
      const deadline = this.deadline(dto.deadline, revision.deadline);
      const history = Array.isArray(revision.deadlineHistory)
        ? revision.deadlineHistory
        : [];
      await tx.listingApplicationRevision.update({
        where: { id: revisionId },
        data: {
          deadline,
          deadlineHistory: json([
            ...history,
            {
              deadline: deadline.toISOString(),
              previousDeadline: revision.deadline.toISOString(),
              adminId: actor.adminId,
              changedAt: new Date().toISOString(),
              reason: dto.reason,
            },
          ]),
        },
      });
      const updated = await tx.listingApplication.update({
        where: { id },
        data: { revisionDeadline: deadline },
      });
      await this.record(
        tx,
        app,
        updated,
        Action.LISTING_REVISION_DEADLINE_UPDATE,
        actor,
        dto.reason,
        { revisionId },
      );
      return this.result(updated, revisionId);
    });
  }

  reject(id: number, reason: string, actor: ListingReviewActor) {
    return this.prisma.$transaction(async (tx) => {
      const app = await this.lock(tx, id, Status.UNDER_REVIEW);
      const updated = await tx.listingApplication.update({
        where: { id },
        data: {
          status: Status.REJECTED,
          reviewComment: reason,
          revisionDeadline: null,
        },
      });
      await this.record(tx, app, updated, Action.LISTING_REJECT, actor, reason);
      return this.result(updated);
    });
  }

  approve(id: number, dto: ApproveListingReqDto, actor: ListingReviewActor) {
    return this.prisma.$transaction(
      async (tx) => {
        const app = await this.lock(tx, id, Status.UNDER_REVIEW);
        const { price, quantity, date, startsAt, priceChanged } = this.approval(
          dto,
          app,
        );
        const approvalData = Object.assign(
          {},
          json(dto),
          priceChanged
            ? { priceAdjustmentReason: dto.priceAdjustmentReason ?? dto.reason }
            : {},
        );
        const issuer = await lockListingIssuer(tx, app.userId);
        if (!issuer) throw new BusinessException(Errors.ACCOUNT);
        if (issuer.withdrawn)
          throw new BusinessException(MatchingErrors.ISSUER_WITHDRAWN);
        const data = plainToInstance(ListingDraftDataReqDto, app.draftData);
        if (!data || (await validate(data)).length)
          throw new BusinessException(Errors.DATA);
        const attachments = await this.steps.getAttachments(
          app.userId,
          data,
          tx,
        );
        const evidence = attachments.evidence;
        const checkData = Object.assign({}, data, {
          desiredPrice: dto.finalPrice,
          totalIssuedQuantity: dto.totalIssuedQuantity,
          desiredListingDate: dto.tradingStartAt,
          evidenceDescription: evidence?.description,
        });
        const issues = [1, 2, 3, 4].flatMap((step) =>
          validateListingStepFields(step, checkData),
        );
        if (
          issues.length ||
          !attachments.mainImage ||
          !evidence ||
          evidence.attachments.length < 1 ||
          evidence.attachments.length > 10 ||
          !(await tx.sector.findUnique({ where: { code: data.sectorCode! } }))
        )
          throw new BusinessException(Errors.DATA, undefined, { issues });
        // 용도별 이미지 형식·소유권·저장 완료 여부를 기존 단계 검증과 같은 기준으로 검사한다.
        if (
          (await this.steps.validate(app.userId, 1, data, new Date(), tx))
            .length ||
          (await this.steps.validate(app.userId, 4, checkData, new Date(), tx))
            .length
        )
          throw new BusinessException(Errors.DATA);
        const tick = BigInt(data.tickSize || '1');
        const minQty = BigInt(data.minOrderQuantity || '1');
        if (price % tick !== 0n || quantity < minQty)
          throw new BusinessException(Errors.APPROVAL);
        const metric = (value: string | null | undefined) => {
          if (!value) return null;
          const n = BigInt(value);
          if (n > BigInt(Number.MAX_SAFE_INTEGER))
            throw new BusinessException(Errors.DATA);
          return n;
        };
        // 승인 후 신청자가 이미지를 교체하거나 삭제할 수 없도록 함께 동결한다.
        for (const collection of Object.values(attachments)) {
          if (collection)
            await this.files.freezeSavedCollection(
              app.userId,
              collection.id,
              tx,
            );
        }
        this.approval(dto, app);
        const stock = await tx.stock.create({
          data: {
            stockCode: await this.stockCodes.next(tx),
            sectorCode: data.sectorCode!,
            name: data.serviceName!,
            summary: data.summary!,
            description: data.description,
            logoImageUrl: data.logoCollectionId
              ? `/api/stocks/listing-images/${app.id}/logo`
              : null,
            mainImageUrl: `/api/stocks/listing-images/${app.id}/main`,
            officialUrl: data.officialUrl,
            operatorName: data.operatorName!,
            listedShares: quantity,
            basePrice: price,
            priceTickSize: tick,
            minOrderPrice: tick,
            minOrderQty: minQty,
            approvedListingDate: date,
            listingDate: startsAt,
            tradeStatus: TradeStatus.PENDING,
            mau: metric(data.mau),
            dau: metric(data.dau),
            revenue: metric(data.revenue),
            transactionVolume: metric(data.transactionVolume),
            metricsStartDate: data.metricsStartDate
              ? new Date(data.metricsStartDate)
              : null,
            metricsEndDate: data.metricsEndDate
              ? new Date(data.metricsEndDate)
              : null,
          },
        });
        const updated = await tx.listingApplication.update({
          where: { id },
          data: {
            status: Status.APPROVED,
            stockId: stock.id,
            approvalData: json(approvalData),
            reviewComment: dto.reason,
            revisionDeadline: null,
          },
        });
        await this.record(
          tx,
          app,
          updated,
          Action.LISTING_APPROVE,
          actor,
          dto.reason,
          {
            stockId: stock.id,
            stockCode: stock.stockCode,
            ...json(approvalData),
          },
        );
        return this.result(updated);
      },
      { timeout: 15000 },
    );
  }

  private approval(dto: ApproveListingReqDto, app: ListingApplication) {
    const price = BigInt(dto.finalPrice),
      quantity = BigInt(dto.totalIssuedQuantity);
    const date = new Date(dto.listingDate),
      startsAt = new Date(dto.tradingStartAt),
      now = new Date();
    const requested = (app.draftData as ListingDraftDataReqDto)?.desiredPrice;
    if (!requested || !/^\d+$/.test(requested) || BigInt(requested) <= 0n)
      throw new BusinessException(Errors.DATA);
    const priceChanged = BigInt(requested) !== price;
    if (
      price <= 0n ||
      quantity <= 0n ||
      price > BigInt(Number.MAX_SAFE_INTEGER) ||
      quantity > BigInt(Number.MAX_SAFE_INTEGER) ||
      price * quantity > BIGINT_MAX ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.listingDate ||
      dto.listingDate < kstDate(now) ||
      !Number.isFinite(startsAt.getTime()) ||
      startsAt <= now ||
      kstDate(startsAt) < dto.listingDate ||
      !dto.reason?.trim()
    )
      throw new BusinessException(Errors.APPROVAL);
    return { price, quantity, date, startsAt, priceChanged };
  }

  private deadline(value: string, previous?: Date) {
    const deadline = new Date(value);
    if (
      !Number.isFinite(deadline.getTime()) ||
      deadline <= new Date() ||
      (previous && deadline <= previous)
    )
      throw new BusinessException(Errors.DEADLINE);
    return deadline;
  }

  private async lock(
    tx: Prisma.TransactionClient,
    id: number,
    expected: Status,
  ) {
    const rows = await tx.$queryRaw<
      { application_id: number }[]
    >`SELECT application_id FROM listing_applications WHERE application_id = ${id} AND deleted_date IS NULL FOR UPDATE`;
    if (!rows.length)
      throw new BusinessException(ListingApplicationErrors.NOT_FOUND);
    const app = await tx.listingApplication.findUniqueOrThrow({
      where: { id },
    });
    if (
      app.status !== expected ||
      !app.applicationNumber ||
      !app.submittedAt ||
      app.stockId
    )
      throw new BusinessException(Errors.STATE);
    return app;
  }

  private async record(
    tx: Prisma.TransactionClient,
    before: ListingApplication,
    after: ListingApplication,
    action: Action,
    actor: ListingReviewActor,
    reason?: string,
    extra: Record<string, unknown> = {},
  ) {
    await this.logs.record(
      {
        ...actor,
        targetType: AdminActivityTarget.LISTING_APPLICATION,
        targetId: before.id,
        targetLabel: before.applicationNumber!,
        action,
        summary: `${LISTING_STATUS_LABELS[before.status]} → ${LISTING_STATUS_LABELS[after.status]}`,
        before: {
          status: before.status,
          revisionDeadline: before.revisionDeadline?.toISOString() ?? null,
        },
        after: {
          status: after.status,
          revisionDeadline: after.revisionDeadline?.toISOString() ?? null,
          ...extra,
        },
        reason,
      },
      tx,
    );
  }

  private result(app: ListingApplication, revisionId: number | null = null) {
    return {
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
      status: app.status,
      stockId: app.stockId,
      revisionId,
      revisionDeadline: app.revisionDeadline,
    };
  }
}
