import type { ListingApprovalResDto } from './dto/res/listing-review-res.dto.js';
import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AttachmentKind,
  AttachmentPurpose,
  Prisma,
} from '../../generated/prisma/client.js';
import type { CollectionResDto } from '../files/dto/res/attachment-res.dto.js';
import { FileErrors } from '../files/files.errors.js';
import { FilesService } from '../files/files.service.js';
import { SectorsService } from '../sectors/sectors.service.js';
import { WITHDRAWN_NICKNAME } from '../users/users.constants.js';
import type { GetAdminListingApplicationsReqDto } from './dto/req/get-admin-listing-applications-req.dto.js';
import type { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';
import type {
  AdminListingApplicationItemResDto,
  AdminListingApplicationResDto,
  GetAdminListingApplicationsResDto,
} from './dto/res/admin-listing-application-res.dto.js';
import {
  LISTING_STATUS_LABELS,
  REVIEWABLE_LISTING_STATUSES,
} from './listing-applications.constants.js';
import { ListingApplicationErrors } from './listing-applications.errors.js';
import { ListingStepValidationService } from './listing-step-validation.service.js';

const reviewableWhere: Prisma.ListingApplicationWhereInput = {
  deletedDate: null,
  applicationNumber: { not: '' },
  submittedAt: { not: null },
  status: { in: [...REVIEWABLE_LISTING_STATUSES] },
};

const listSelect = {
  id: true,
  applicationNumber: true,
  serviceName: true,
  submittedAt: true,
  status: true,
  draftData: true,
  user: { select: { id: true, loginId: true, nickname: true } },
} satisfies Prisma.ListingApplicationSelect;

type ListingSummary = Prisma.ListingApplicationGetPayload<{
  select: typeof listSelect;
}>;

function containsSearch(value: string) {
  // Prisma의 contains는 LIKE를 사용하므로 패턴 문자를 이스케이프한다.
  return {
    contains: value.replace(/[\\%_]/g, '\\$&'),
    mode: 'insensitive' as const,
  };
}

@Injectable()
export class ListingApplicationsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly steps: ListingStepValidationService,
    private readonly files: FilesService,
    private readonly sectors: SectorsService,
  ) {}

  async list(
    query: GetAdminListingApplicationsReqDto,
  ): Promise<GetAdminListingApplicationsResDto> {
    const { from, to, keyword, applicant, page, size, status, sectorCode } =
      query;
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;
    if (start && end && start >= end)
      throw new BusinessException(
        ListingApplicationErrors.INVALID_SUBMITTED_PERIOD,
      );

    const where: Prisma.ListingApplicationWhereInput = {
      ...reviewableWhere,
      ...(status && { status }),
      submittedAt: { not: null, gte: start, lt: end },
      ...(sectorCode !== undefined && {
        draftData: { path: ['sectorCode'], equals: sectorCode },
      }),
    };
    if (keyword) {
      const matches = containsSearch(keyword);
      where.OR = [
        { applicationNumber: matches },
        { serviceName: matches },
        { user: { OR: [{ loginId: matches }, { nickname: matches }] } },
      ];
    }
    if (applicant) {
      const matches = containsSearch(applicant);
      where.user = { OR: [{ loginId: matches }, { nickname: matches }] };
    }
    const [[items, totalCount], sectorNames] = await Promise.all([
      this.prisma.$transaction(
        [
          this.prisma.listingApplication.findMany({
            where,
            select: listSelect,
            orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * size,
            take: size,
          }),
          this.prisma.listingApplication.count({ where }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      ),
      this.sectorNames(),
    ]);
    return {
      items: items.map((item) => this.summary(item, sectorNames)),
      page,
      size,
      totalCount,
    };
  }

  async detail(id: number): Promise<AdminListingApplicationResDto> {
    const application = await this.findReviewable(id);
    const data = application.draftData as ListingDraftDataReqDto;
    const [attachments, sectorNames] = await Promise.all([
      this.steps.getAttachments(application.user.id, data),
      this.sectorNames(),
    ]);
    return {
      ...this.summary(application, sectorNames),
      stockId: application.stockId,
      approval:
        application.approvalData as unknown as ListingApprovalResDto | null,
      reviewComment: application.reviewComment,
      revisionDeadline: application.revisionDeadline,
      listingBlockedAt: application.stock?.listingBlockedAt ?? null,
      listingBlockedReason: application.stock?.listingBlockedReason ?? null,
      data,
      attachments: {
        logo: this.withAdminPaths(id, attachments.logo),
        mainImage: this.withAdminPaths(id, attachments.mainImage),
        evidence: this.withAdminPaths(id, attachments.evidence),
      },
      revisions: application.revisions.map((revision) => ({
        id: revision.id,
        requestItems: revision.requestItems,
        deadlineHistory: revision.deadlineHistory,
        previousEvidence: this.withAdminPaths(
          id,
          this.previousEvidence(revision.previousData),
        ),
        requestContent: revision.requestContent,
        deadline: revision.deadline,
        createDate: revision.createDate,
        resubmittedAt: revision.resubmittedAt,
        evidence: this.withAdminPaths(id, this.revisionEvidence(revision)),
      })),
    };
  }

  async download(id: number, attachmentId: string) {
    const application = await this.findReviewable(id);
    const userId = application.user.id;
    const current = await this.steps.getAttachments(
      userId,
      application.draftData as ListingDraftDataReqDto,
    );
    const collections = [
      current.evidence,
      current.mainImage,
      current.logo,
      ...application.revisions.flatMap((revision) => [
        this.revisionEvidence(revision),
        this.previousEvidence(revision.previousData),
      ]),
    ];
    const collection = collections.find((candidate) =>
      candidate?.attachments.some(
        (item) =>
          item?.id === attachmentId &&
          item.saved === true &&
          item.kind === AttachmentKind.FILE,
      ),
    );
    if (!collection) throw new BusinessException(FileErrors.NOT_FOUND);

    // 이력 스냅샷 이후에도 실제 파일의 소유자, 용도와 저장 완료 상태를 검사한다.
    return this.files.download(
      userId,
      collection.id,
      attachmentId,
      collection.purpose,
    );
  }

  private async findReviewable(id: number) {
    if (!Number.isInteger(id) || id < 1 || id > 2147483647)
      throw new BusinessException(ListingApplicationErrors.NOT_FOUND);
    const application = await this.prisma.listingApplication.findFirst({
      where: { ...reviewableWhere, id },
      select: {
        ...listSelect,
        stockId: true,
        approvalData: true,
        stock: {
          select: { listingBlockedAt: true, listingBlockedReason: true },
        },
        reviewComment: true,
        revisionDeadline: true,
        revisions: {
          orderBy: { id: 'desc' },
          select: {
            id: true,
            requestItems: true,
            deadlineHistory: true,
            previousData: true,
            requestContent: true,
            deadline: true,
            createDate: true,
            resubmittedAt: true,
            evidenceCollectionId: true,
            evidenceSnapshot: true,
          },
        },
      },
    });
    if (!application)
      throw new BusinessException(ListingApplicationErrors.NOT_FOUND);
    return application;
  }

  private async sectorNames(): Promise<ReadonlyMap<number, string>> {
    const { items } = await this.sectors.getSectors();
    return new Map(
      items.map(({ sectorCode, sectorName }) => [sectorCode, sectorName]),
    );
  }

  private summary(
    { user, draftData, ...item }: ListingSummary,
    sectorNames: ReadonlyMap<number, string>,
  ) {
    const code = (draftData as ListingDraftDataReqDto | null)?.sectorCode;
    const sectorCode =
      typeof code === 'number' && Number.isInteger(code) && code > 0
        ? code
        : null;
    // 상세 조회 결과도 들어오므로 목록 공통 항목을 명시적으로 선택한다.
    return {
      id: item.id,
      applicationNumber: item.applicationNumber,
      serviceName: item.serviceName,
      sectorCode,
      sectorName:
        sectorCode === null ? null : (sectorNames.get(sectorCode) ?? null),
      submittedAt: item.submittedAt,
      status: item.status,
      statusLabel: LISTING_STATUS_LABELS[item.status],
      applicant: {
        userId: user.id,
        loginId: user.loginId,
        nickname: user.nickname ?? WITHDRAWN_NICKNAME,
      },
    } satisfies AdminListingApplicationItemResDto;
  }

  private previousEvidence(value: Prisma.JsonValue): CollectionResDto | null {
    const previous = value as {
      _attachments?: { evidence?: CollectionResDto };
    } | null;
    const evidence = previous?._attachments?.evidence;
    return evidence?.purpose === AttachmentPurpose.EVIDENCE &&
      Array.isArray(evidence.attachments)
      ? evidence
      : null;
  }

  private revisionEvidence(revision: {
    resubmittedAt: Date | null;
    evidenceCollectionId: string | null;
    evidenceSnapshot: Prisma.JsonValue;
  }): CollectionResDto | null {
    const evidence =
      revision.evidenceSnapshot as unknown as CollectionResDto | null;
    if (
      !revision.resubmittedAt ||
      !revision.evidenceCollectionId ||
      evidence?.id !== revision.evidenceCollectionId ||
      evidence.purpose !== AttachmentPurpose.EVIDENCE ||
      !Array.isArray(evidence.attachments)
    )
      return null;
    return evidence;
  }

  private withAdminPaths(
    applicationId: number,
    collection: CollectionResDto | null,
  ): CollectionResDto | null {
    if (!collection) return null;
    return {
      id: collection.id,
      purpose: collection.purpose,
      description: collection.description,
      attachments: collection.attachments
        .filter((item) => item?.saved === true)
        .map((item) => ({
          id: item.id,
          kind: item.kind,
          originalName: item.originalName,
          contentType: item.contentType,
          size: item.size,
          url: item.kind === AttachmentKind.LINK ? item.url : null,
          saved: item.saved,
          downloadPath:
            item.kind === AttachmentKind.FILE
              ? `/api/admin/listing-applications/${applicationId}/attachments/${item.id}/content`
              : null,
        })),
    };
  }
}
