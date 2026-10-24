import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AttachmentPurpose,
  ListingApplicationStatus,
  Prisma,
} from '../../generated/prisma/client.js';
import type { ListingApplication } from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import type { SaveListingDraftReqDto } from './dto/req/save-listing-draft-req.dto.js';
import type { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';
import {
  LISTING_DRAFT_LIFETIME_MS,
  LISTING_DRAFT_WARNING_MS,
  MAX_LISTING_DRAFTS,
} from './listing-applications.constants.js';
import { ListingApplicationErrors as Errors } from './listing-applications.errors.js';
import { normalizeListingUrl } from './listing-applications.validation.js';

@Injectable()
export class ListingApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async create(userId: number, dto: SaveListingDraftReqDto) {
    await this.checkAttachments(userId, dto.data);
    return this.withUserLock(userId, async (tx, now) => {
      const count = await tx.listingApplication.count({
        where: this.activeDrafts(userId, now),
      });
      if (count >= MAX_LISTING_DRAFTS)
        throw new BusinessException(Errors.LIMIT);
      const data = this.mergeData({}, dto.data);
      const normalizedOfficialUrl = normalizeListingUrl(
        data.officialUrl as string | null | undefined,
      );
      await this.releaseExpiredUrl(tx, normalizedOfficialUrl, now);
      const item = await tx.listingApplication.create({
        data: {
          userId,
          currentStep: dto.currentStep ?? 1,
          draftData: data,
          serviceName: (data.serviceName as string | null | undefined) ?? null,
          officialUrl: (data.officialUrl as string | null | undefined) ?? null,
          normalizedOfficialUrl,
          lastSavedAt: now,
          expiresAt: new Date(now.getTime() + LISTING_DRAFT_LIFETIME_MS),
        },
      });
      return this.detail(item, now);
    });
  }

  list(userId: number, limit: number) {
    return this.withUserLock(userId, async (tx, now) => {
      const where = this.activeDrafts(userId, now);
      const totalCount = await tx.listingApplication.count({ where });
      const items = await tx.listingApplication.findMany({
        where,
        orderBy: [{ lastSavedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      return {
        items: items.map((item) => this.summary(item, now)),
        totalCount,
        maxCount: MAX_LISTING_DRAFTS,
        canCreate: totalCount < MAX_LISTING_DRAFTS,
      };
    });
  }

  get(userId: number, id: number) {
    return this.withUserLock(userId, async (tx, now) =>
      this.detail(await this.findDraft(tx, userId, id, now), now),
    );
  }

  async save(userId: number, id: number, dto: SaveListingDraftReqDto) {
    await this.checkAttachments(userId, dto.data);
    return this.withUserLock(userId, async (tx, now) => {
      const current = await this.findDraft(tx, userId, id, now);
      const data = this.mergeData(
        current.draftData as Prisma.InputJsonObject,
        dto.data,
      );
      const normalizedOfficialUrl = normalizeListingUrl(
        data.officialUrl as string | null | undefined,
      );
      await this.releaseExpiredUrl(tx, normalizedOfficialUrl, now);
      const updated = await tx.listingApplication.updateMany({
        where: { ...this.activeDrafts(userId, now), id },
        data: {
          currentStep: dto.currentStep ?? current.currentStep,
          draftData: data,
          serviceName: (data.serviceName as string | null | undefined) ?? null,
          officialUrl: (data.officialUrl as string | null | undefined) ?? null,
          normalizedOfficialUrl,
          lastSavedAt: now,
          expiresAt: new Date(now.getTime() + LISTING_DRAFT_LIFETIME_MS),
        },
      });
      if (updated.count !== 1) throw new BusinessException(Errors.EXPIRED);
      return this.detail(
        await tx.listingApplication.findUniqueOrThrow({ where: { id } }),
        now,
      );
    });
  }

  remove(userId: number, id: number) {
    return this.withUserLock(userId, async (tx, now) => {
      await this.findDraft(tx, userId, id, now);
      const result = await tx.listingApplication.updateMany({
        where: { ...this.activeDrafts(userId, now), id },
        data: { deletedDate: now },
      });
      if (result.count !== 1) throw new BusinessException(Errors.EXPIRED);
    });
  }

  /** 다중 인스턴스에서 중복 실행해도 안전하다. 객체 저장소 파일은 직접 삭제하지 않는다. */
  async expireDueDrafts(now = new Date()) {
    const result = await this.prisma.listingApplication.updateMany({
      where: {
        status: ListingApplicationStatus.DRAFT,
        deletedDate: null,
        expiresAt: { lte: now },
      },
      data: { status: ListingApplicationStatus.EXPIRED },
    });
    return result.count;
  }

  private activeDrafts(
    userId: number,
    now: Date,
  ): Prisma.ListingApplicationWhereInput {
    return {
      userId,
      status: ListingApplicationStatus.DRAFT,
      deletedDate: null,
      expiresAt: { gt: now },
    };
  }

  private async findDraft(
    tx: Prisma.TransactionClient,
    userId: number,
    id: number,
    now: Date,
  ) {
    const item = await tx.listingApplication.findFirst({
      where: { id, userId, deletedDate: null },
    });
    if (!item) throw new BusinessException(Errors.NOT_FOUND);
    if (
      item.status === ListingApplicationStatus.EXPIRED ||
      (item.status === ListingApplicationStatus.DRAFT && item.expiresAt <= now)
    )
      throw new BusinessException(Errors.EXPIRED);
    if (item.status !== ListingApplicationStatus.DRAFT)
      throw new BusinessException(Errors.NOT_DRAFT);
    return item;
  }

  private async releaseExpiredUrl(
    tx: Prisma.TransactionClient,
    url: string | null,
    now: Date,
  ) {
    if (url)
      await tx.listingApplication.updateMany({
        where: {
          normalizedOfficialUrl: url,
          status: ListingApplicationStatus.DRAFT,
          deletedDate: null,
          expiresAt: { lte: now },
        },
        data: { status: ListingApplicationStatus.EXPIRED },
      });
  }

  private async withUserLock<T>(
    userId: number,
    action: (tx: Prisma.TransactionClient, now: Date) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // 같은 계정의 생성·수정·삭제를 직렬화해 5건 초과를 방지한다.
            const users = await tx.$queryRaw<
              { user_id: number }[]
            >`SELECT user_id FROM users WHERE user_id = ${userId} FOR UPDATE`;
            if (!users.length) throw new BusinessException(Errors.NOT_FOUND);
            const now = new Date();
            await tx.listingApplication.updateMany({
              where: {
                userId,
                status: ListingApplicationStatus.DRAFT,
                deletedDate: null,
                expiresAt: { lte: now },
              },
              data: { status: ListingApplicationStatus.EXPIRED },
            });
            return action(tx, now);
          },
          { timeout: 10000 },
        );
      } catch (error) {
        const failure = error as { code?: string; meta?: { code?: string } };
        // 생성·수정에서 설정하는 유일한 UNIQUE 값은 진행 중 공식 URL이다.
        if (failure?.code === 'P2002')
          throw new BusinessException(Errors.DUPLICATE_URL);
        if (
          failure?.code !== 'P2034' &&
          !(failure?.code === 'P2010' && failure.meta?.code === '40P01')
        )
          throw error;
        if (attempt === 2) throw new BusinessException(Errors.CONFLICT);
      }
    }
    throw new BusinessException(Errors.CONFLICT);
  }

  private mergeData(
    current: Prisma.InputJsonObject,
    patch?: ListingDraftDataReqDto,
  ): Prisma.InputJsonObject {
    const normalized = Object.fromEntries(
      Object.entries(patch ?? {})
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [
          key,
          typeof value === 'string' ? value.trim() || null : value,
        ]),
    );
    return { ...current, ...normalized };
  }

  private async checkAttachments(
    userId: number,
    data?: ListingDraftDataReqDto,
  ) {
    for (const [id, purpose] of [
      [data?.logoCollectionId, AttachmentPurpose.LOGO],
      [data?.mainImageCollectionId, AttachmentPurpose.MAIN_IMAGE],
      [data?.evidenceCollectionId, AttachmentPurpose.EVIDENCE],
    ] as const) {
      if (!id) continue;
      const collection = await this.files.getSavedCollection(userId, id);
      if (collection.purpose !== purpose)
        throw new BusinessException(Errors.ATTACHMENT);
    }
  }

  private summary(item: ListingApplication, now: Date) {
    return {
      id: item.id,
      status: item.status,
      serviceName: item.serviceName,
      currentStep: item.currentStep,
      lastSavedAt: item.lastSavedAt,
      expiresAt: item.expiresAt,
      expiresSoon:
        item.expiresAt.getTime() - now.getTime() <= LISTING_DRAFT_WARNING_MS,
    };
  }

  private detail(item: ListingApplication, now: Date) {
    return {
      ...this.summary(item, now),
      data: item.draftData as ListingDraftDataReqDto,
      applicationNumber: item.applicationNumber,
    };
  }
}
