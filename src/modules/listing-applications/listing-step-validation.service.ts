import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  AttachmentKind,
  AttachmentPurpose,
} from '../../generated/prisma/client.js';
import { FilesService } from '../files/files.service.js';
import { SectorsService } from '../sectors/sectors.service.js';
import type { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';
import type { CollectionResDto } from '../files/dto/res/attachment-res.dto.js';
import { validateListingStepFields } from './listing-steps.validation.js';

@Injectable()
export class ListingStepValidationService {
  constructor(
    private readonly files: FilesService,
    private readonly sectors: SectorsService,
  ) {}

  async validate(
    userId: number,
    step: number,
    data: ListingDraftDataReqDto,
    now: Date,
    tx: Prisma.TransactionClient,
  ) {
    const issues = validateListingStepFields(step, data, now);
    if (
      step === 1 &&
      data.sectorCode &&
      Number.isSafeInteger(data.sectorCode)
    ) {
      if (
        !(await this.sectors.getSectors()).items.some(
          (item) => item.sectorCode === data.sectorCode,
        )
      )
        issues.push({
          field: 'sectorCode',
          message: '존재하는 카테고리를 선택해 주세요.',
        });
    }
    for (const [field, purpose] of (step === 1
      ? [
          ['logoCollectionId', AttachmentPurpose.LOGO],
          ['mainImageCollectionId', AttachmentPurpose.MAIN_IMAGE],
        ]
      : step === 4
        ? [['evidenceCollectionId', AttachmentPurpose.EVIDENCE]]
        : []) as [keyof ListingDraftDataReqDto, AttachmentPurpose][]) {
      const id = data[field];
      if (typeof id !== 'string' || !id) continue;
      const collection = await this.readCollection(userId, id, purpose, tx);
      if (!collection) {
        issues.push({
          field,
          message: '본인의 해당 용도로 저장한 첨부 작성 묶음을 선택해 주세요.',
        });
        continue;
      }
      if (
        purpose !== AttachmentPurpose.EVIDENCE &&
        (collection.attachments.length !== 1 ||
          collection.attachments[0].kind !== AttachmentKind.FILE ||
          !collection.attachments[0].contentType?.startsWith('image/'))
      )
        issues.push({
          field,
          message: '저장 완료된 이미지 1개를 선택해 주세요.',
        });
      if (
        purpose === AttachmentPurpose.EVIDENCE &&
        collection.attachments.length > 10
      )
        issues.push({
          field,
          message: '파일과 링크는 합산 최대 10개까지 등록할 수 있습니다.',
        });
    }
    return issues;
  }

  async getAttachments(userId: number, data: ListingDraftDataReqDto) {
    return {
      logo: data.logoCollectionId
        ? await this.readCollection(
            userId,
            data.logoCollectionId,
            AttachmentPurpose.LOGO,
          )
        : null,
      mainImage: data.mainImageCollectionId
        ? await this.readCollection(
            userId,
            data.mainImageCollectionId,
            AttachmentPurpose.MAIN_IMAGE,
          )
        : null,
      evidence: data.evidenceCollectionId
        ? await this.readCollection(
            userId,
            data.evidenceCollectionId,
            AttachmentPurpose.EVIDENCE,
          )
        : null,
    };
  }

  private async readCollection(
    userId: number,
    id: string,
    purpose: AttachmentPurpose,
    tx?: Prisma.TransactionClient,
  ): Promise<CollectionResDto | null> {
    try {
      const result = await this.files.getSavedCollection(userId, id, tx);
      return result.purpose === purpose ? result : null;
    } catch (error) {
      // 삭제되거나 없는 첨부는 조회 시 null로 표현하며 타인의 자료를 노출하지 않는다.
      if (error instanceof BusinessException && error.getStatus() === 404)
        return null;
      throw error;
    }
  }
}
