import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminActivityAction,
  AdminActivityTarget,
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
  'title' | 'content' | 'type' | 'isImportant' | 'postStartDate' | 'postEndDate'
>;

interface NoticeActor {
  adminId: number;
  client: ClientInfo;
}

const listSelect = {
  id: true,
  type: true,
  title: true,
  isImportant: true,
  postStartDate: true,
  postEndDate: true,
  createDate: true,
  modifiedDate: true,
} satisfies Prisma.NoticeSelect;

@Injectable()
export class NoticesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLogs: AdminActivityLogsService,
  ) {}

  async list({
    page,
    size,
  }: GetAdminNoticesReqDto): Promise<GetAdminNoticesResDto> {
    const where = { isDeleted: false };
    const [notices, totalCount] = await this.prisma.$transaction(
      [
        this.prisma.notice.findMany({
          where,
          select: listSelect,
          orderBy: [{ postStartDate: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * size,
          take: size,
        }),
        this.prisma.notice.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const now = new Date();
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
    const data: NoticeFields = {
      type: dto.type,
      title: dto.title,
      content: dto.content,
      isImportant: dto.isImportant ?? false,
      postStartDate: new Date(dto.postStartDate),
      postEndDate: dto.postEndDate ? new Date(dto.postEndDate) : null,
    };
    this.checkPeriod(data);
    return this.write(async (tx, now) => {
      await this.checkPinLimit(tx, data, now);
      const notice = await tx.notice.create({ data });
      await this.activityLogs.record(
        {
          ...actor,
          targetType: AdminActivityTarget.NOTICE,
          targetId: notice.id,
          targetLabel: notice.title,
          action: AdminActivityAction.NOTICE_PUBLISH,
          summary: notice.postStartDate > now ? '공지 게시 예약' : '공지 등록',
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
  ): Promise<AdminNoticeResDto> {
    return this.write(async (tx, now) => {
      const notice = await this.findNotice(tx, id);
      const data: NoticeFields = {
        type: dto.type ?? notice.type,
        title: dto.title ?? notice.title,
        content: dto.content ?? notice.content,
        isImportant: dto.isImportant ?? notice.isImportant,
        postStartDate: dto.postStartDate
          ? new Date(dto.postStartDate)
          : notice.postStartDate,
        postEndDate:
          dto.postEndDate === undefined
            ? notice.postEndDate
            : dto.postEndDate === null
              ? null
              : new Date(dto.postEndDate),
      };
      this.checkPeriod(data);
      const before = this.snapshot(notice);
      const after = this.snapshot(data);
      const fields = (Object.keys(after) as (keyof typeof after)[]).filter(
        (field) => before[field] !== after[field],
      );
      if (fields.length === 0) return this.toDetail(notice, now);
      if (
        before.isImportant !== after.isImportant ||
        before.postStartDate !== after.postStartDate ||
        before.postEndDate !== after.postEndDate
      )
        await this.checkPinLimit(tx, data, now, id);

      const updated = await tx.notice.update({ where: { id }, data });
      await this.activityLogs.record(
        {
          ...actor,
          targetType: AdminActivityTarget.NOTICE,
          targetId: id,
          targetLabel: updated.title,
          action: AdminActivityAction.NOTICE_UPDATE,
          summary: '공지 수정',
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

  async remove(id: number, actor: NoticeActor): Promise<void> {
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
          targetLabel: notice.title,
          action: AdminActivityAction.NOTICE_DELETE,
          summary: '공지 삭제',
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
    });
    if (!notice) throw new BusinessException(Errors.ADMIN_NOT_FOUND);
    return notice;
  }

  private checkPeriod(data: NoticeFields) {
    if (data.postEndDate && data.postEndDate <= data.postStartDate)
      throw new BusinessException(Errors.INVALID_PERIOD);
  }

  private async checkPinLimit(
    tx: Prisma.TransactionClient,
    data: NoticeFields,
    now: Date,
    currentId?: number,
  ) {
    const start = new Date(
      Math.max(now.getTime(), data.postStartDate.getTime()),
    );
    const end = data.postEndDate;
    if (!data.isImportant || (end && end <= start)) return;

    const periods = await tx.notice.findMany({
      where: {
        id: currentId === undefined ? undefined : { not: currentId },
        isDeleted: false,
        isImportant: true,
        postStartDate: end ? { lt: end } : undefined,
        OR: [{ postEndDate: null }, { postEndDate: { gt: start } }],
      },
      select: { postStartDate: true, postEndDate: true },
    });
    // 시작·종료가 같은 시각이면 한 번에 반영해 [시작, 종료) 기간을 계산한다.
    const changes = new Map<number, number>();
    for (const period of periods) {
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
      title: data.title,
      content: data.content,
      isImportant: data.isImportant,
      postStartDate: data.postStartDate.toISOString(),
      postEndDate: data.postEndDate?.toISOString() ?? null,
    };
  }

  private toItem(
    notice: Prisma.NoticeGetPayload<{ select: typeof listSelect }>,
    now: Date,
  ): AdminNoticeItemResDto {
    let status = AdminNoticeStatus.PUBLISHED;
    if (notice.postStartDate > now) status = AdminNoticeStatus.SCHEDULED;
    else if (notice.postEndDate && notice.postEndDate <= now)
      status = AdminNoticeStatus.ENDED;
    return {
      noticeId: notice.id,
      type: notice.type,
      title: notice.title,
      isImportant: notice.isImportant,
      postStartDate: notice.postStartDate,
      postEndDate: notice.postEndDate,
      status,
      createDate: notice.createDate,
      modifiedDate: notice.modifiedDate,
    };
  }

  private toDetail(notice: Notice, now: Date): AdminNoticeResDto {
    return Object.assign(this.toItem(notice, now), { content: notice.content });
  }
}
