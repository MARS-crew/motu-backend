import { Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import {
  MailSender,
  TrackedMailError,
  type TrackedMailResult,
} from '../../common/mail/mail-sender.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ClientInfo } from '../../common/utils/client-info.js';
import {
  AdminActivityAction as Action,
  AdminActivityResult,
  AdminActivityTarget,
  InquiryStatus as Status,
  InquiryReplyStatus as ReplyStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import type {
  Inquiry,
  InquiryReplyAttempt,
} from '../../generated/prisma/client.js';
import { AdminActivityLogsService } from '../admin-activity-logs/admin-activity-logs.service.js';
import type {
  GetAdminInquiriesReqDto,
  GetAdminInquiryDetailReqDto,
} from './dto/req/get-admin-inquiries-req.dto.js';
import type {
  SaveInquiryReplyDraftReqDto,
  SendInquiryReplyReqDto,
} from './dto/req/reply-inquiry-req.dto.js';
import {
  effectiveReplyStatus,
  INQUIRY_STATUS_LABELS,
} from './inquiries-admin.constants.js';
import { InquiryAdminErrors as Errors } from './inquiries-admin.errors.js';

export interface InquiryAdminActor {
  adminId: number;
  client?: ClientInfo;
}
const actorSelect = { id: true, loginId: true, nickname: true };
const itemSelect = {
  id: true,
  inquiryCode: true,
  inquiryType: true,
  title: true,
  status: true,
  createDate: true,
  modifiedDate: true,
  processingStartedAt: true,
  completedAt: true,
  assignedAdmin: { select: actorSelect },
} satisfies Prisma.InquirySelect;
type Item = Prisma.InquiryGetPayload<{ select: typeof itemSelect }>;

@Injectable()
export class InquiriesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: AdminActivityLogsService,
    private readonly mail: MailSender,
  ) {}

  async list(query: GetAdminInquiriesReqDto) {
    const where: Prisma.InquiryWhereInput = {
      status: query.status,
      inquiryType: query.inquiryType,
      ...(query.keyword
        ? {
            inquiryCode: {
              contains: query.keyword.replace(/[\\%_]/g, '\\$&'),
              mode: 'insensitive',
            },
          }
        : {}),
    };
    const [items, totalCount] = await this.prisma.$transaction(
      [
        this.prisma.inquiry.findMany({
          where,
          select: itemSelect,
          orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.size,
          take: query.size,
        }),
        this.prisma.inquiry.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: items.map((item) => this.item(item)),
      page: query.page,
      size: query.size,
      totalCount,
    };
  }

  detail(id: number, query: GetAdminInquiryDetailReqDto) {
    this.checkId(id);
    return this.prisma.$transaction(
      async (tx) => {
        const inquiry = await tx.inquiry.findUnique({
          where: { id },
          include: {
            assignedAdmin: { select: actorSelect },
            activeReplyAttempt: true,
          },
        });
        if (!inquiry) throw new BusinessException(Errors.NOT_FOUND);
        const [attempts, totalCount] = await Promise.all([
          tx.inquiryReplyAttempt.findMany({
            where: { inquiryId: id },
            orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
            skip: (query.attemptPage - 1) * query.attemptSize,
            take: query.attemptSize,
          }),
          tx.inquiryReplyAttempt.count({ where: { inquiryId: id } }),
        ]);
        const busy = this.blocksDraft(inquiry.activeReplyAttempt);
        return {
          ...this.item(inquiry),
          content: inquiry.content,
          replyEmail: inquiry.replyEmail,
          replyDraft: inquiry.replyDraft,
          replyVersion: inquiry.replyVersion,
          canEdit: inquiry.status === Status.IN_PROGRESS && !busy,
          latestReplyAttempt: inquiry.activeReplyAttempt
            ? this.attempt(inquiry.activeReplyAttempt)
            : null,
          replyAttempts: {
            items: attempts.map((item) => this.attempt(item)),
            page: query.attemptPage,
            size: query.attemptSize,
            totalCount,
          },
          activityLogPath: `/api/admin/activity-logs?targetType=INQUIRY&targetId=${id}`,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  start(id: number, actor: InquiryAdminActor) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (
        before.status === Status.IN_PROGRESS &&
        before.assignedAdminId !== null
      ) {
        // 담당자 기록은 배타적 소유권이 아니다. 다른 관리자의 재요청도 기존 시작을 보존한다.
        return this.processingResult(before);
      }
      if (
        before.status !== Status.SUBMITTED &&
        before.status !== Status.IN_PROGRESS
      )
        throw new BusinessException(Errors.STATE);
      // 기존 접수의 회신 주소는 가입 이메일로 보강한다. 요청 본문에서 수신자를 받지 않는다.
      const email =
        before.replyEmail ??
        (
          await tx.user.findUnique({
            where: { id: before.userId },
            select: { email: true },
          })
        )?.email;
      if (!email || !isEmail(email)) throw new BusinessException(Errors.EMAIL);
      const after = await tx.inquiry.update({
        where: { id },
        data: {
          status: Status.IN_PROGRESS,
          assignedAdminId: actor.adminId,
          processingStartedAt: new Date(),
          replyEmail: email,
        },
      });
      await this.record(
        tx,
        after,
        actor,
        Action.INQUIRY_START,
        '문의 처리 시작',
        { status: before.status, assignedAdminId: before.assignedAdminId },
        { status: after.status, assignedAdminId: after.assignedAdminId },
      );
      return this.processingResult(after);
    });
  }

  saveDraft(id: number, dto: SaveInquiryReplyDraftReqDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, id);
      if (before.status !== Status.IN_PROGRESS)
        throw new BusinessException(Errors.STATE);
      const current = before.activeReplyAttemptId
        ? await tx.inquiryReplyAttempt.findUnique({
            where: { id: before.activeReplyAttemptId },
          })
        : null;
      if (this.blocksDraft(current))
        throw new BusinessException(
          current && effectiveReplyStatus(current) === ReplyStatus.UNKNOWN
            ? Errors.UNKNOWN
            : Errors.SENDING,
        );
      if (before.replyVersion !== dto.expectedVersion) {
        // 마지막 저장 응답 유실로 같은 내용을 재전송한 경우 새 버전을 만들지 않는다.
        if (
          before.replyVersion === dto.expectedVersion + 1 &&
          before.replyDraft === dto.replyText
        )
          return this.draftResult(before);
        throw new BusinessException(Errors.VERSION);
      }
      if (before.replyDraft === dto.replyText) return this.draftResult(before);
      const after = await tx.inquiry.update({
        where: { id },
        data: { replyDraft: dto.replyText, replyVersion: { increment: 1 } },
      });
      // 확인 팝업 전 내부 저장이다. 상태·처리자 변경이 없어 운영 활동 이력을 생성하지 않는다.
      return this.draftResult(after);
    });
  }

  async sendReply(
    id: number,
    dto: SendInquiryReplyReqDto,
    actor: InquiryAdminActor,
  ) {
    const reserved = await this.reserve(id, dto, actor);
    if (!reserved.created) return this.finishOrFail(reserved.attempt.id, actor);
    let receipt: {
      status: ReplyStatus;
      deliveryMode: string | null;
      providerMessageId: string | null;
      errorCode: string | null;
    };
    try {
      const result: TrackedMailResult = await this.mail.sendTracked({
        to: reserved.attempt.toEmail,
        subject: `[MOTU] 문의 답변 (${reserved.inquiryCode})`,
        text: `안녕하세요. MOTU입니다.\n\n문의번호: ${reserved.inquiryCode}\n\n${reserved.attempt.replyText}\n\n계정 잠금 해제 및 이용 제한 변경은 본인 확인 후 별도로 처리됩니다.`,
      });
      if (!result || !['BREVO', 'CONSOLE'].includes(result.mode))
        throw new Error('추적 가능한 발송 결과가 필요합니다.');
      receipt = {
        status:
          result.mode === 'CONSOLE'
            ? ReplyStatus.SIMULATED
            : ReplyStatus.ACCEPTED,
        deliveryMode: result.mode,
        providerMessageId: result.messageId,
        errorCode: null,
      };
    } catch (error) {
      const knownFailure =
        error instanceof TrackedMailError && error.outcome === 'FAILED';
      receipt = {
        status: knownFailure ? ReplyStatus.FAILED : ReplyStatus.UNKNOWN,
        deliveryMode: null,
        providerMessageId: null,
        errorCode: knownFailure ? 'MAIL_SEND_FAILED' : 'MAIL_DELIVERY_UNKNOWN',
      };
    }
    // 실제 발송은 DB 롤백으로 취소할 수 없다. 공급자 결과를 먼저 별도로 보존한다.
    await this.prisma.inquiryReplyAttempt.update({
      where: { id: reserved.attempt.id },
      data: { ...receipt, finishedAt: new Date(), finalizedAt: null },
    });
    return this.finishOrFail(reserved.attempt.id, actor);
  }

  private reserve(
    id: number,
    dto: SendInquiryReplyReqDto,
    actor: InquiryAdminActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const inquiry = await this.lock(tx, id);
      const existing = await tx.inquiryReplyAttempt.findUnique({
        where: {
          inquiryId_requestId: { inquiryId: id, requestId: dto.requestId },
        },
      });
      if (existing) {
        if (
          existing.draftVersion !== dto.expectedDraftVersion ||
          (existing.retryReason ?? null) !== (dto.retryReason ?? null)
        )
          throw new BusinessException(Errors.KEY);
        return {
          created: false,
          attempt: existing,
          inquiryCode: inquiry.inquiryCode,
        };
      }
      if (inquiry.status !== Status.IN_PROGRESS)
        throw new BusinessException(Errors.STATE);
      if (inquiry.replyVersion !== dto.expectedDraftVersion)
        throw new BusinessException(Errors.VERSION);
      if (!inquiry.replyDraft?.trim())
        throw new BusinessException(Errors.EMPTY);
      if (!inquiry.replyEmail || !isEmail(inquiry.replyEmail))
        throw new BusinessException(Errors.EMAIL);
      if (dto.confirmResend !== true && dto.retryReason !== undefined)
        throw new BusinessException(Errors.RETRY);
      const previous = inquiry.activeReplyAttemptId
        ? await tx.inquiryReplyAttempt.findUnique({
            where: { id: inquiry.activeReplyAttemptId },
          })
        : null;
      if (previous) {
        const status = effectiveReplyStatus(previous);
        if (status === ReplyStatus.SENDING)
          throw new BusinessException(Errors.SENDING);
        if (status === ReplyStatus.ACCEPTED)
          throw new BusinessException(
            Errors.STATE,
            '발송은 접수됐습니다. 이전 requestId로 완료 반영을 다시 요청해 주세요.',
          );
        if (status === ReplyStatus.UNKNOWN) {
          if (dto.confirmResend !== true || !dto.retryReason?.trim())
            throw new BusinessException(Errors.RETRY);
          if (previous.status === ReplyStatus.SENDING) {
            await tx.inquiryReplyAttempt.update({
              where: { id: previous.id },
              data: {
                status: ReplyStatus.UNKNOWN,
                errorCode: 'INQUIRY_REPLY_STALE',
                finishedAt: new Date(),
              },
            });
          }
        } else if (dto.confirmResend)
          throw new BusinessException(
            Errors.RETRY,
            '불명확한 이전 발송이 있을 때만 재발송 확인을 사용할 수 있습니다.',
          );
      } else if (dto.confirmResend) throw new BusinessException(Errors.RETRY);
      const attempt = await tx.inquiryReplyAttempt.create({
        data: {
          inquiryId: id,
          requestId: dto.requestId,
          adminId: actor.adminId,
          draftVersion: inquiry.replyVersion,
          toEmail: inquiry.replyEmail,
          replyText: inquiry.replyDraft,
          retryReason: dto.confirmResend ? dto.retryReason : null,
        },
      });
      await tx.inquiry.update({
        where: { id },
        data: {
          activeReplyAttemptId: attempt.id,
          assignedAdminId: actor.adminId,
        },
      });
      await this.record(
        tx,
        inquiry,
        actor,
        Action.INQUIRY_REPLY_SEND,
        '문의 이메일 답변 발송 요청',
        { status: inquiry.status, assignedAdminId: inquiry.assignedAdminId },
        {
          requestId: attempt.requestId,
          attemptId: attempt.id,
          replyVersion: attempt.draftVersion,
          outcome: attempt.status,
          assignedAdminId: actor.adminId,
          retryReason: attempt.retryReason,
        },
      );
      return { created: true, attempt, inquiryCode: inquiry.inquiryCode };
    });
  }

  private async finishOrFail(attemptId: string, actor: InquiryAdminActor) {
    const observed = await this.prisma.inquiryReplyAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    });
    const status = effectiveReplyStatus(observed);
    if (status === ReplyStatus.SENDING)
      throw new BusinessException(Errors.SENDING, undefined, { attemptId });
    if (observed.status === ReplyStatus.SENDING)
      throw new BusinessException(Errors.UNKNOWN, undefined, {
        attemptId,
        requiresReview: true,
      });
    const result = await this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, observed.inquiryId);
      const attempt = await tx.inquiryReplyAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      let inquiry = before;
      if (!attempt.finalizedAt) {
        if (
          attempt.status === ReplyStatus.ACCEPTED &&
          before.status !== Status.COMPLETED
        ) {
          inquiry = await tx.inquiry.update({
            where: { id: before.id },
            data: {
              status: Status.COMPLETED,
              completedAt: attempt.finishedAt ?? new Date(),
              assignedAdminId: actor.adminId,
            },
          });
        }
        const summary = {
          ACCEPTED: '문의 이메일 답변 발송 접수 및 완료',
          FAILED: '문의 이메일 답변 발송 실패',
          UNKNOWN: '문의 이메일 답변 발송 결과 확인 필요',
          SIMULATED: '문의 이메일 답변 콘솔 모의 발송',
          SENDING: '문의 이메일 답변 발송 중',
        }[attempt.status];
        await this.record(
          tx,
          inquiry,
          actor,
          Action.INQUIRY_REPLY_SEND,
          summary,
          { status: before.status, assignedAdminId: before.assignedAdminId },
          {
            status: inquiry.status,
            assignedAdminId: inquiry.assignedAdminId,
            requestId: attempt.requestId,
            attemptId: attempt.id,
            outcome: attempt.status,
            deliveryMode: attempt.deliveryMode,
            providerMessageId: attempt.providerMessageId,
          },
          [ReplyStatus.FAILED, ReplyStatus.UNKNOWN].some(
            (status) => status === attempt.status,
          )
            ? AdminActivityResult.FAILURE
            : AdminActivityResult.SUCCESS,
        );
        await tx.inquiryReplyAttempt.update({
          where: { id: attempt.id },
          data: { finalizedAt: new Date() },
        });
      }
      const final = await tx.inquiryReplyAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      return {
        inquiryId: inquiry.id,
        status: inquiry.status,
        statusLabel: INQUIRY_STATUS_LABELS[inquiry.status],
        completedAt: inquiry.completedAt,
        attempt: this.attempt(final),
        simulated: final.status === ReplyStatus.SIMULATED,
      };
    });
    if (result.attempt.status === ReplyStatus.FAILED)
      throw new BusinessException(Errors.FAILED, undefined, { attemptId });
    if (result.attempt.status === ReplyStatus.UNKNOWN)
      throw new BusinessException(Errors.UNKNOWN, undefined, {
        attemptId,
        requiresReview: true,
      });
    return result;
  }

  private async lock(tx: Prisma.TransactionClient, id: number) {
    this.checkId(id);
    const rows = await tx.$queryRaw<
      { inquiry_id: number }[]
    >`SELECT inquiry_id FROM inquiries WHERE inquiry_id=${id} FOR UPDATE`;
    if (!rows.length) throw new BusinessException(Errors.NOT_FOUND);
    return tx.inquiry.findUniqueOrThrow({ where: { id } });
  }
  private checkId(id: number) {
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
      throw new BusinessException(Errors.NOT_FOUND);
  }
  private blocksDraft(attempt: InquiryReplyAttempt | null) {
    return (
      !!attempt &&
      [ReplyStatus.SENDING, ReplyStatus.UNKNOWN, ReplyStatus.ACCEPTED].some(
        (status) => status === effectiveReplyStatus(attempt),
      )
    );
  }
  private item(item: Item) {
    return {
      id: item.id,
      inquiryCode: item.inquiryCode,
      inquiryType: item.inquiryType,
      title: item.title,
      status: item.status,
      statusLabel: INQUIRY_STATUS_LABELS[item.status],
      assignedAdmin: item.assignedAdmin
        ? {
            userId: item.assignedAdmin.id,
            loginId: item.assignedAdmin.loginId,
            nickname: item.assignedAdmin.nickname,
          }
        : null,
      createDate: item.createDate,
      modifiedDate: item.modifiedDate,
      processingStartedAt: item.processingStartedAt,
      completedAt: item.completedAt,
    };
  }
  private processingResult(item: Inquiry) {
    return {
      id: item.id,
      status: item.status,
      statusLabel: INQUIRY_STATUS_LABELS[item.status],
      assignedAdminId: item.assignedAdminId,
      processingStartedAt: item.processingStartedAt,
      replyEmail: item.replyEmail,
      replyVersion: item.replyVersion,
    };
  }
  private draftResult(item: Inquiry) {
    return {
      id: item.id,
      status: item.status,
      replyDraft: item.replyDraft,
      replyVersion: item.replyVersion,
    };
  }
  private attempt(item: InquiryReplyAttempt) {
    return {
      id: item.id,
      requestId: item.requestId,
      adminId: item.adminId,
      draftVersion: item.draftVersion,
      toEmail: item.toEmail,
      replyText: item.replyText,
      status: effectiveReplyStatus(item),
      deliveryMode: item.deliveryMode,
      providerMessageId: item.providerMessageId,
      errorCode: item.errorCode,
      retryReason: item.retryReason,
      createDate: item.createDate,
      finishedAt: item.finishedAt,
      finalizedAt: item.finalizedAt,
    };
  }
  private record(
    tx: Prisma.TransactionClient,
    item: Inquiry,
    actor: InquiryAdminActor,
    action: Action,
    summary: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    result: AdminActivityResult = AdminActivityResult.SUCCESS,
  ) {
    return this.logs.record(
      {
        ...actor,
        targetType: AdminActivityTarget.INQUIRY,
        targetId: item.id,
        targetLabel: item.inquiryCode,
        action,
        summary,
        before,
        after,
        result,
      },
      tx,
    );
  }
}
