import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  AttachmentKind,
  AttachmentPurpose,
} from '../../generated/prisma/client.js';
import type {
  Attachment,
  AttachmentCollection,
  Prisma,
} from '../../generated/prisma/client.js';
import { FileStorageService } from './file-storage.service.js';
import { FileErrors } from './files.errors.js';
import { validateExternalUrl, validateFile } from './files.validation.js';
import type { SaveCollectionReqDto } from './dto/req/save-collection-req.dto.js';

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}
  create(userId: number, purpose: AttachmentPurpose) {
    return this.prisma.attachmentCollection.create({
      data: { userId, purpose },
      select: { id: true, purpose: true, description: true, attachments: true },
    });
  }
  async get(userId: number, id: string) {
    const collection = await this.prisma.attachmentCollection.findFirst({
      where: { id, userId },
      include: {
        attachments: { orderBy: [{ createDate: 'asc' }, { id: 'asc' }] },
      },
    });
    if (!collection) throw new BusinessException(FileErrors.NOT_FOUND);
    return {
      id: collection.id,
      purpose: collection.purpose,
      description: collection.description,
      attachments: collection.attachments.map((item) => this.response(item)),
    };
  }
  async upload(userId: number, id: string, files: Express.Multer.File[]) {
    const collection = await this.get(userId, id);
    if (!files?.length) throw new BusinessException(FileErrors.REQUIRED);
    const maximum = collection.purpose === AttachmentPurpose.EVIDENCE ? 10 : 1;
    if (collection.attachments.length + files.length > maximum)
      throw new BusinessException(FileErrors.COUNT);
    // 전체 배치를 먼저 검증하여 잘못된 파일이 섞이면 저장소에 쓰지 않는다.
    const metadata = await Promise.all(
      files.map((file) =>
        validateFile(file, collection.purpose !== AttachmentPurpose.EVIDENCE),
      ),
    );
    const keys = files.map(
      (_, index) => `${id}/${randomUUID()}${metadata[index].extension}`,
    );
    try {
      for (let i = 0; i < files.length; i++)
        await this.storage.put(
          keys[i],
          files[i].buffer,
          metadata[i].contentType,
        );
      return await this.prisma.$transaction(async (tx) => {
        const locked = await this.lock(tx, userId, id);
        await this.checkCount(tx, locked, files.length);
        const result = [];
        for (let i = 0; i < files.length; i++)
          result.push(
            this.response(
              await tx.attachment.create({
                data: {
                  collectionId: id,
                  kind: AttachmentKind.FILE,
                  originalName: files[i].originalname,
                  size: files[i].buffer.length,
                  contentType: metadata[i].contentType,
                  objectKey: keys[i],
                },
              }),
            ),
          );
        return result;
      });
    } catch (error) {
      await this.storage.cleanup(keys);
      throw error;
    }
  }
  async addLink(userId: number, id: string, input: string) {
    const url = validateExternalUrl(input);
    return this.prisma.$transaction(async (tx) => {
      const collection = await this.lock(tx, userId, id);
      if (collection.purpose !== AttachmentPurpose.EVIDENCE)
        throw new BusinessException(FileErrors.FORMAT);
      await this.checkCount(tx, collection, 1);
      return this.response(
        await tx.attachment.create({
          data: { collectionId: id, kind: AttachmentKind.LINK, url },
        }),
      );
    });
  }
  async save(userId: number, id: string, dto: SaveCollectionReqDto) {
    await this.prisma.$transaction(async (tx) => {
      const collection = await this.lock(tx, userId, id);
      const description = dto.description ?? collection.description;
      if (
        dto.validateStep &&
        collection.purpose === AttachmentPurpose.EVIDENCE &&
        (!description ||
          description.trim().length < 10 ||
          description.length > 500)
      )
        throw new BusinessException(FileErrors.DESCRIPTION);
      const count = await tx.attachment.count({
        where: { collectionId: id, id: { in: dto.attachmentIds } },
      });
      if (count !== dto.attachmentIds.length)
        throw new BusinessException(FileErrors.INCOMPLETE);
      await tx.attachment.updateMany({
        where: { collectionId: id },
        data: { saved: false },
      });
      await tx.attachment.updateMany({
        where: { collectionId: id, id: { in: dto.attachmentIds } },
        data: { saved: true },
      });
      await tx.attachmentCollection.update({
        where: { id },
        data: { description, savedAt: new Date() },
      });
    });
    return this.get(userId, id);
  }
  async remove(userId: number, id: string, attachmentId: string) {
    const key = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, userId, id);
      const item = await tx.attachment.findFirst({
        where: { id: attachmentId, collectionId: id },
      });
      if (!item) throw new BusinessException(FileErrors.NOT_FOUND);
      await tx.attachment.delete({ where: { id: attachmentId } });
      return item.objectKey;
    });
    // 먼저 DB 참조를 제거한다. 저장소 삭제 실패는 비공개 미참조 객체로 남으며 로그로 추적한다.
    if (key) await this.storage.cleanup([key]);
  }
  async download(userId: number, id: string, attachmentId: string) {
    const collection = await this.get(userId, id);
    const item = collection.attachments.find(
      (item) => item.id === attachmentId && item.kind === AttachmentKind.FILE,
    );
    if (!item) throw new BusinessException(FileErrors.NOT_FOUND);
    const record = await this.prisma.attachment.findUniqueOrThrow({
      where: { id: attachmentId },
    });
    return {
      body: await this.storage.get(record.objectKey!),
      contentType: record.contentType!,
    };
  }
  /** 신청서 모듈은 클라이언트 URL 대신 이 메서드가 반환한 저장 완료 자료만 연결한다. */
  async getSavedCollection(userId: number, id: string) {
    const result = await this.get(userId, id);
    return {
      ...result,
      attachments: result.attachments.filter((item) => item.saved),
    };
  }
  private response(item: Attachment) {
    return {
      id: item.id,
      kind: item.kind,
      originalName: item.originalName,
      contentType: item.contentType,
      size: item.size,
      url: item.url,
      saved: item.saved,
      downloadPath:
        item.kind === AttachmentKind.FILE
          ? `/api/files/collections/${item.collectionId}/attachments/${item.id}/content`
          : null,
    };
  }
  private async lock(tx: Prisma.TransactionClient, userId: number, id: string) {
    const rows = await tx.$queryRaw<
      AttachmentCollection[]
    >`SELECT * FROM attachment_collections WHERE id = ${id}::uuid AND user_id = ${userId} FOR UPDATE`;
    if (!rows.length) throw new BusinessException(FileErrors.NOT_FOUND);
    return rows[0];
  }
  private async checkCount(
    tx: Prisma.TransactionClient,
    collection: AttachmentCollection,
    added: number,
  ) {
    const count = await tx.attachment.count({
      where: { collectionId: collection.id },
    });
    if (
      count + added >
      (collection.purpose === AttachmentPurpose.EVIDENCE ? 10 : 1)
    )
      throw new BusinessException(FileErrors.COUNT);
  }
}
