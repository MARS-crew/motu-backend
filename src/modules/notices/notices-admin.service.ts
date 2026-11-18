import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
  NoticeStatus,
  NoticeType,
  Prisma,
} from '../../generated/prisma/client.js';
import type { Notice } from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import type { CreateAdminNoticeReqDto } from './dto/req/create-admin-notice-req.dto.js';
import type { GetAdminNoticesReqDto } from './dto/req/get-admin-notices-req.dto.js';
import type { UpdateAdminNoticeReqDto } from './dto/req/update-admin-notice-req.dto.js';
import {
  AdminNoticeStatus,
  type AdminNoticeItemResDto,
  type AdminNoticeResDto,
  type GetAdminNoticesResDto,
} from './dto/res/admin-notice-res.dto.js';
import { MAX_PINNED_NOTICES } from './notices.constants.js';
import { NoticeErrors as Errors } from './notices.errors.js';

type NoticeFields = Pick<
  Notice,
  | 'title'
  | 'content'
  | 'type'
  | 'status'
  | 'stockId'
  | 'isImportant'
  | 'postStartDate'
  | 'postEndDate'
>;

interface NoticeActor {
  adminId: number;
  client: ClientInfo;
}

const stockInclude = {
  stock: { select: { stockCode: true, name: true } },
} satisfies Prisma.NoticeInclude;

const listSelect = {
  id: true,
  type: true,
  status: true,
  stockId: true,
  ...stockInclude,
  isDeleted: true,
  title: true,
  isImportant: true,
  postStartDate: true,
  postEndDate: true,
  createDate: true,
  modifiedDate: true,
} satisfies Prisma.NoticeSelect;

type NoticeWithStock = Prisma.NoticeGetPayload<{
  include: typeof stockInclude;
}>;

@Injectable()
export class NoticesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogs: AdminActivityLogsService,
  ) {}

  async list(query: GetAdminNoticesReqDto): Promise<GetAdminNoticesResDto> {
    const { page, size, type, stockId, keyword, status, from, to } = query;
    const now = new Date();
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;
    if (start && end && end <= start)
      throw new BusinessException(Errors.INVALID_PERIOD);

    const filters: Prisma.NoticeWhereInput[] = [this.statusWhere(status, now)];
    if (keyword) {
      const title = keyword.replace(/[\\%_]/g, '\\$&');
      const id = /^\d+$/.test(keyword) ? Number(keyword) : 0;
      filters.push({
        OR: [
          { title: { contains: title, mode: 'insensitive' } },
          ...(id > 0 && id <= 2147483647 ? [{ id }] : []),
        ],
      });
    }
    if (start || end) {
      filters.push({
        postStartDate: { not: null, lt: end },
        ...(start && {
          OR: [{ postEndDate: null }, { postEndDate: { gt: start } }],
        }),
      });
    }
    const where: Prisma.NoticeWhereInput = { type, stockId, AND: filters };
    const [notices, totalCount] = await this.prisma.$transaction(
      [
        this.prisma.notice.findMany({
          where,
          select: listSelect,
          orderBy: [
            { postStartDate: { sort: 'desc', nulls: 'last' } },
            { id: 'desc' },
          ],
          skip: (page - 1) * size,
          take: size,
        }),
        this.prisma.notice.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: notices.map((notice) => this.toItem(notice, now)),
      totalCount,
      page,
      size,
    };
  }

  async detail(id: number): Promise<AdminNoticeResDto> {
    return this.toDetail(await this.findNotice(this.prisma, id), new Date());
  }

  create(
    dto: CreateAdminNoticeReqDto,
    actor: NoticeActor,
  ): Promise<AdminNoticeResDto> {
    const status = dto.status ?? NoticeStatus.POSTED;
    if (status === NoticeStatus.POSTED && !dto.type)
      throw new BusinessException(Errors.REQUIRED_FIELDS);
    const data: NoticeFields = {
      type: dto.type ?? NoticeType.ALL,
      status,
      stockId: dto.stockId ?? null,
      title: dto.title ?? '',
      content: dto.content ?? '',
      isImportant: dto.isImportant ?? false,
      postStartDate: dto.postStartDate ? new Date(dto.postStartDate) : null,
      postEndDate: dto.postEndDate ? new Date(dto.postEndDate) : null,
    };
    return this.write(async (tx, now) => {
      await this.checkNotice(tx, data);
      await this.checkPinLimit(tx, data, now);
      const notice = await tx.notice.create({ data, include: stockInclude });
      const isDraft = status === NoticeStatus.DRAFT;
      await this.activityLogs.record(
        {
          ...actor,
          targetType: AdminActivityTarget.NOTICE,
          targetId: notice.id,
          targetLabel: this.targetLabel(notice),
          action: isDraft
            ? AdminActivityAction.NOTICE_UPDATE
            : AdminActivityAction.NOTICE_PUBLISH,
          summary: isDraft
            ? '공지 임시 저장'
            : this.publishSummary(notice, now),
          after: this.snapshot(notice),
        },
        tx,
      );
      return this.toDetail(notice, now);
    });
  }

  update(
    id: number,
    dto: UpdateAdminNoticeReqDto,
    actor: NoticeActor,
    publish = false,
  ): Promise<AdminNoticeResDto> {
    return this.write(async (tx, now) => {
      const notice = await this.findNotice(tx, id);
      const data: NoticeFields = {
        type: dto.type ?? notice.type,
        status: publish ? NoticeStatus.POSTED : notice.status,
        stockId:
          dto.stockId === undefined
            ? dto.type === NoticeType.ALL
              ? null
              : notice.stockId
            : dto.stockId,
        title: dto.title ?? notice.title,
        content: dto.content ?? notice.content,
        isImportant: dto.isImportant ?? notice.isImportant,
        postStartDate:
          dto.postStartDate === undefined
            ? notice.postStartDate
            : dto.postStartDate === null
              ? null
              : new Date(dto.postStartDate),
        postEndDate:
          dto.postEndDate === undefined
            ? notice.postEndDate
            : dto.postEndDate === null
              ? null
              : new Date(dto.postEndDate),
      };
      await this.checkNotice(tx, data);
      if (publish && data.postEndDate && data.postEndDate <= now)
        throw new BusinessException(Errors.PUBLISH_PERIOD_ENDED);
      const before = this.snapshot(notice);
      const after = this.snapshot(data);
      const fields = (Object.keys(after) as (keyof typeof after)[]).filter(
        (field) => before[field] !== after[field],
      );
      if (fields.length === 0) return this.toDetail(notice, now);
      if (
        before.isImportant !== after.isImportant ||
        before.status !== after.status ||
        before.postStartDate !== after.postStartDate ||
        before.postEndDate !== after.postEndDate
      )
        await this.checkPinLimit(tx, data, now, id);

      const updated = await tx.notice.update({
        where: { id },
        data,
        include: stockInclude,
      });
      const publishing = publish && notice.status !== NoticeStatus.POSTED;
      await this.activityLogs.record(
        {
          ...actor,
          targetType: AdminActivityTarget.NOTICE,
          targetId: id,
          targetLabel: this.targetLabel(updated),
          action: publishing
            ? AdminActivityAction.NOTICE_PUBLISH
            : AdminActivityAction.NOTICE_UPDATE,
          summary: publishing ? this.publishSummary(updated, now) : '공지 수정',
          before: Object.fromEntries(
            fields.map((field) => [field, before[field]]),
          ),
          after: Object.fromEntries(
            fields.map((field) => [field, after[field]]),
          ),
        },
        tx,
      );
      return this.toDetail(updated, now);
    });
  }

  hide(
    id: number,
    reason: string,
    actor: NoticeActor,
  ): Promise<AdminNoticeResDto> {
    return this.write(async (tx, now) => {
      const notice = await this.findNotice(tx, id);
      if (notice.status === NoticeStatus.DRAFT)
        throw new BusinessException(Errors.INVALID_STATUS);
      if (notice.status === NoticeStatus.HIDDEN)
        return this.toDetail(notice, now);

      const updated = await tx.notice.update({
        where: { id },
        data: { status: NoticeStatus.HIDDEN },
        include: stockInclude,
      });
      await this.activityLogs.record(
        {
          ...actor,
          targetType: AdminActivityTarget.NOTICE,
          targetId: id,
          targetLabel: this.targetLabel(notice),
          action: AdminActivityAction.NOTICE_HIDE,
          summary: '공지 비공개',
          reason,
          before: { status: notice.status },
          after: { status: updated.status },
        },
        tx,
      );
      return this.toDetail(updated, now);
    });
  }

  async remove(id: number, reason: string, actor: NoticeActor): Promise<void> {
    await this.write(async (tx, now) => {
      const notice = await this.findNotice(tx, id);
      await tx.notice.update({
        where: { id },
        data: { isDeleted: true, deletedDate: now },
      });
      await this.activityLogs.record(
        {
          ...actor,
          targetType: AdminActivityTarget.NOTICE,
          targetId: id,
          targetLabel: this.targetLabel(notice),
          action: AdminActivityAction.NOTICE_DELETE,
          summary: '공지 삭제',
          reason,
          before: { isDeleted: false },
          after: { isDeleted: true, deletedDate: now.toISOString() },
        },
        tx,
      );
    });
  }

  private write<T>(
    operation: (tx: Prisma.TransactionClient, now: Date) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // 동시 등록·수정·삭제를 직렬화하되 사용자 공지 조회는 계속 허용한다.
        await tx.$executeRaw`LOCK TABLE "notices" IN SHARE ROW EXCLUSIVE MODE`;
        return operation(tx, new Date());
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private async findNotice(db: Prisma.TransactionClient, id: number) {
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
      throw new BusinessException(Errors.ADMIN_NOT_FOUND);
    const notice = await db.notice.findFirst({
      where: { id, isDeleted: false },
      include: stockInclude,
    });
    if (!notice) throw new BusinessException(Errors.ADMIN_NOT_FOUND);
    return notice;
  }

  private async checkNotice(tx: Prisma.TransactionClient, data: NoticeFields) {
    if (
      data.status !== NoticeStatus.DRAFT &&
      (!data.title || !data.content || !data.postStartDate)
    )
      throw new BusinessException(Errors.REQUIRED_FIELDS);
    if (
      data.postStartDate &&
      data.postEndDate &&
      data.postEndDate <= data.postStartDate
    )
      throw new BusinessException(Errors.INVALID_PERIOD);
    if (
      (data.type === NoticeType.ALL && data.stockId !== null) ||
      (data.type === NoticeType.STOCK &&
        data.stockId === null &&
        data.status !== NoticeStatus.DRAFT)
    )
      throw new BusinessException(Errors.INVALID_TARGET);
    if (data.stockId !== null) {
      const stock = await tx.stock.findFirst({
        where: { id: data.stockId, isDeleted: false },
        select: { id: true },
      });
      if (!stock) throw new BusinessException(Errors.STOCK_NOT_FOUND);
    }
  }

  private async checkPinLimit(
    tx: Prisma.TransactionClient,
    data: NoticeFields,
    now: Date,
    currentId?: number,
  ) {
    if (
      data.status !== NoticeStatus.POSTED ||
      !data.isImportant ||
      !data.postStartDate
    )
      return;
    const start = new Date(
      Math.max(now.getTime(), data.postStartDate.getTime()),
    );
    const end = data.postEndDate;
    if (end && end <= start) return;

    const periods = await tx.notice.findMany({
      where: {
        id: currentId === undefined ? undefined : { not: currentId },
        isDeleted: false,
        status: NoticeStatus.POSTED,
        isImportant: true,
        postStartDate: end ? { lt: end } : undefined,
        OR: [{ postEndDate: null }, { postEndDate: { gt: start } }],
      },
      select: { postStartDate: true, postEndDate: true },
    });
    // 시작·종료가 같은 시각이면 한 번에 반영해 [시작, 종료) 기간을 계산한다.
    const changes = new Map<number, number>();
    for (const period of periods) {
      if (!period.postStartDate) continue;
      const begins = Math.max(period.postStartDate.getTime(), start.getTime());
      if (period.postEndDate && period.postEndDate.getTime() <= begins)
        continue;
      changes.set(begins, (changes.get(begins) ?? 0) + 1);
      if (period.postEndDate) {
        const finishes = period.postEndDate.getTime();
        changes.set(finishes, (changes.get(finishes) ?? 0) - 1);
      }
    }
    let active = 0;
    for (const [, change] of [...changes].sort(([a], [b]) => a - b)) {
      active += change;
      if (active >= MAX_PINNED_NOTICES) {
        throw new BusinessException(Errors.PIN_LIMIT_EXCEEDED);
      }
    }
  }

  private snapshot(data: NoticeFields) {
    return {
      type: data.type,
      status: data.status,
      stockId: data.stockId,
      title: data.title,
      content: data.content,
      isImportant: data.isImportant,
      postStartDate: data.postStartDate?.toISOString() ?? null,
      postEndDate: data.postEndDate?.toISOString() ?? null,
    };
  }

  private statusWhere(
    status: AdminNoticeStatus | undefined,
    now: Date,
  ): Prisma.NoticeWhereInput {
    switch (status) {
      case AdminNoticeStatus.DELETED:
        return { isDeleted: true };
      case AdminNoticeStatus.DRAFT:
      case AdminNoticeStatus.HIDDEN:
        return { isDeleted: false, status };
      case AdminNoticeStatus.SCHEDULED:
        return {
          isDeleted: false,
          status: NoticeStatus.POSTED,
          postStartDate: { gt: now },
        };
      case AdminNoticeStatus.PUBLISHED:
        return {
          isDeleted: false,
          status: NoticeStatus.POSTED,
          postStartDate: { lte: now },
          OR: [{ postEndDate: null }, { postEndDate: { gt: now } }],
        };
      case AdminNoticeStatus.ENDED:
        return {
          isDeleted: false,
          status: NoticeStatus.POSTED,
          postStartDate: { lte: now },
          postEndDate: { lte: now },
        };
      default:
        return { isDeleted: false };
    }
  }

  private targetLabel(notice: Notice) {
    return notice.title || `공지 #${notice.id}`;
  }

  private publishSummary(notice: Notice, now: Date) {
    return notice.postStartDate && notice.postStartDate > now
      ? '공지 게시 예약'
      : '공지 게시';
  }

  private toItem(
    notice: Prisma.NoticeGetPayload<{ select: typeof listSelect }>,
    now: Date,
  ): AdminNoticeItemResDto {
    let status = AdminNoticeStatus.PUBLISHED;
    if (notice.isDeleted) status = AdminNoticeStatus.DELETED;
    else if (notice.status === NoticeStatus.DRAFT)
      status = AdminNoticeStatus.DRAFT;
    else if (notice.status === NoticeStatus.HIDDEN)
      status = AdminNoticeStatus.HIDDEN;
    else if (notice.postStartDate && notice.postStartDate > now)
      status = AdminNoticeStatus.SCHEDULED;
    else if (notice.postEndDate && notice.postEndDate <= now)
      status = AdminNoticeStatus.ENDED;
    return {
      noticeId: notice.id,
      type: notice.type,
      stockId: notice.stockId,
      stockCode: notice.stock?.stockCode ?? null,
      stockName: notice.stock?.name ?? null,
      title: notice.title,
      isImportant: notice.isImportant,
      postStartDate: notice.postStartDate,
      postEndDate: notice.postEndDate,
      status,
      createDate: notice.createDate,
      modifiedDate: notice.modifiedDate,
    };
  }

  private toDetail(notice: NoticeWithStock, now: Date): AdminNoticeResDto {
    return Object.assign(this.toItem(notice, now), { content: notice.content });
  }
}
