import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AttachmentPurpose,
  ListingApplicationStatus as Status,
  Prisma,
} from '../../generated/prisma/client.js';
import type {
  ListingApplication,
  ListingApplicationRevision,
} from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import type { CollectionResDto } from '../files/dto/res/attachment-res.dto.js';
import { ListingRevisionErrors as Errors } from './listing-revisions.errors.js';

@Injectable()
export class ListingRevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /** 본인 보완 요청만 조회한다. 소유자 ID는 필수다. */
  list(applicationId: number, page: number, size: number, userId: number) {
    this.checkId(applicationId);
    this.checkId(userId);
    return this.prisma.$transaction(
      async (tx) => {
        const app = await tx.listingApplication.findFirst({
          where: {
            id: applicationId,
            deletedDate: null,
            userId,
          },
        });
        if (!app) throw new BusinessException(Errors.NOT_FOUND);
        const where = { applicationId };
        const items = await tx.listingApplicationRevision.findMany({
          where,
          orderBy: { id: 'desc' },
          skip: (page - 1) * size,
          take: size,
        });
        const totalCount = await tx.listingApplicationRevision.count({ where });
        const now = new Date();
        return {
          applicationId,
          applicationNumber: app.applicationNumber,
          status: app.status,
          items: items.map((revision) => this.toItem(app, revision, now)),
          page,
          size,
          totalCount,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  resubmit(
    userId: number,
    applicationId: number,
    revisionId: number,
    evidenceCollectionId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const app = await this.lockApplication(tx, applicationId, userId);
        const revision = await this.findRevision(tx, applicationId, revisionId);
        // 같은 자료의 재전송은 기존 성공을 반환하고, 새 회차나 현재 상태를 덮어쓰지 않는다.
        if (revision.resubmittedAt) {
          if (revision.evidenceCollectionId !== evidenceCollectionId)
            throw new BusinessException(Errors.ALREADY_SUBMITTED);
          return this.result(app, revision, new Date());
        }
        if (
          app.status !== Status.REVISION_REQUESTED ||
          !app.applicationNumber ||
          !app.submittedAt
        )
          throw new BusinessException(Errors.INVALID_STATE);
        this.checkDeadline(revision.deadline, new Date());
        let evidence: CollectionResDto;
        try {
          evidence = await this.files.getSavedCollection(
            userId,
            evidenceCollectionId,
            tx,
          );
        } catch (error) {
          if (error instanceof BusinessException && error.getStatus() === 404)
            throw new BusinessException(Errors.EVIDENCE);
          throw error;
        }
        if (
          evidence.purpose !== AttachmentPurpose.EVIDENCE ||
          evidence.attachments.length < 1 ||
          evidence.attachments.length > 10 ||
          !evidence.description ||
          evidence.description.trim().length < 10 ||
          evidence.description.length > 500
        )
          throw new BusinessException(Errors.EVIDENCE);
        // 파일 잠금을 기다리는 사이 기한이 지나지 않았는지 반영 직전에 다시 확인한다.
        const now = new Date();
        this.checkDeadline(revision.deadline, now);
        await this.files.freezeSavedCollection(
          userId,
          evidenceCollectionId,
          tx,
        );
        const updatedRevision = await tx.listingApplicationRevision.update({
          where: { id: revisionId },
          data: {
            resubmittedAt: now,
            evidenceCollectionId,
            evidenceSnapshot: evidence as unknown as Prisma.InputJsonObject,
          },
        });
        const updated = await tx.listingApplication.update({
          where: { id: applicationId },
          data: {
            status: Status.UNDER_REVIEW,
            revisionDeadline: null,
            draftData: {
              ...(app.draftData as Prisma.InputJsonObject),
              evidenceCollectionId,
            },
          },
        });
        return this.result(updated, updatedRevision, now);
      },
      { timeout: 10000 },
    );
  }

  private async lockApplication(
    tx: Prisma.TransactionClient,
    applicationId: number,
    userId: number,
  ) {
    this.checkId(applicationId);
    this.checkId(userId);
    const apps = await tx.$queryRaw<
      { application_id: number }[]
    >`SELECT application_id FROM listing_applications WHERE application_id = ${applicationId} AND user_id = ${userId} AND deleted_date IS NULL FOR UPDATE`;
    if (!apps.length) throw new BusinessException(Errors.NOT_FOUND);
    return tx.listingApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
  }
  private async findRevision(
    tx: Prisma.TransactionClient,
    applicationId: number,
    revisionId: number,
  ) {
    this.checkId(revisionId);
    const revision = await tx.listingApplicationRevision.findFirst({
      where: { id: revisionId, applicationId },
    });
    if (!revision) throw new BusinessException(Errors.NOT_FOUND);
    return revision;
  }
  private checkId(id: number) {
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
      throw new BusinessException(Errors.NOT_FOUND);
  }
  private checkDeadline(deadline: Date, now: Date) {
    if (now >= deadline) throw new BusinessException(Errors.DEADLINE_PASSED);
  }
  private result(
    app: ListingApplication,
    revision: ListingApplicationRevision,
    now: Date,
  ) {
    return {
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
      status: app.status,
      revision: this.toItem(app, revision, now),
    };
  }
  private toItem(
    app: ListingApplication,
    revision: ListingApplicationRevision,
    now: Date,
  ) {
    const isDeadlinePassed =
      !revision.resubmittedAt && now >= revision.deadline;
    return {
      id: revision.id,
      requestContent: revision.requestContent,
      deadline: revision.deadline,
      isDeadlinePassed,
      canResubmit:
        !revision.resubmittedAt &&
        !isDeadlinePassed &&
        !!app.applicationNumber &&
        !!app.submittedAt &&
        app.status === Status.REVISION_REQUESTED,
      resubmittedAt: revision.resubmittedAt,
      evidenceCollectionId: revision.evidenceCollectionId,
      evidence: revision.evidenceSnapshot as unknown as CollectionResDto | null,
      createDate: revision.createDate,
    };
  }
}
