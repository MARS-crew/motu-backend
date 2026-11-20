import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ListingApplicationStatus } from '../../generated/prisma/client.js';
import { FileErrors } from '../files/files.errors.js';
import { FilesService } from '../files/files.service.js';
import { ListingStepValidationService } from './listing-step-validation.service.js';
import type { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';

/** 승인 상품의 공개 이미지에만 접근한다. 증빙자료는 공개하지 않는다. */
@ApiTags('Stocks')
@Controller('stocks/listing-images')
export class ListingStockImagesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly steps: ListingStepValidationService,
    private readonly files: FilesService,
  ) {}
  @Public()
  @Get(':id/:kind')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: '상장 승인 상품의 로고·대표 이미지',
    description:
      '공개된 상품의 main 또는 logo만 제공한다. 증빙자료와 비공개 상품은 제공하지 않는다.',
  })
  @ApiProduces('image/png', 'image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND' })
  async image(
    @Param('id', ParseIdPipe) id: number,
    @Param('kind') kind: string,
  ) {
    if (!['main', 'logo'].includes(kind))
      throw new BusinessException(FileErrors.NOT_FOUND);
    const app = await this.prisma.listingApplication.findFirst({
      where: {
        id,
        deletedDate: null,
        status: ListingApplicationStatus.APPROVED,
        stock: { isDeleted: false, isPublic: true },
      },
    });
    if (!app) throw new BusinessException(FileErrors.NOT_FOUND);
    const data = app.draftData as ListingDraftDataReqDto;
    // 증빙자료를 읽지 않고 로고·대표 이미지 묶음만 확인한다.
    const images = await this.steps.getAttachments(app.userId, {
      logoCollectionId: data.logoCollectionId,
      mainImageCollectionId: data.mainImageCollectionId,
    });
    const collection = kind === 'main' ? images.mainImage : images.logo;
    const attachment = collection?.attachments[0];
    if (!collection || !attachment?.contentType?.startsWith('image/'))
      throw new BusinessException(FileErrors.NOT_FOUND);
    const file = await this.files.download(
      app.userId,
      collection.id,
      attachment.id,
      collection.purpose,
    );
    return new StreamableFile(file.body, {
      type: file.contentType,
      length: file.body.length,
      disposition: 'inline',
    });
  }
}
