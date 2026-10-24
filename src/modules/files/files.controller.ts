import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe.js';
import { CreateCollectionReqDto } from './dto/req/create-collection-req.dto.js';
import { CreateLinkReqDto } from './dto/req/create-link-req.dto.js';
import { SaveCollectionReqDto } from './dto/req/save-collection-req.dto.js';
import {
  AttachmentResDto,
  CollectionResDto,
} from './dto/res/attachment-res.dto.js';
import { FilesService } from './files.service.js';
import { PDF_LIMIT } from './files.validation.js';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files/collections')
export class FilesController {
  constructor(private readonly files: FilesService) {}
  @Post()
  @ApiOperation({ summary: '첨부 작성 묶음 생성 (증빙 / 로고 / 대표 이미지)' })
  @ApiCreatedResponse({ type: CollectionResDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCollectionReqDto) {
    return this.files.create(user.userId, dto.purpose);
  }
  @Get(':id')
  @ApiOkResponse({ type: CollectionResDto })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUuidPipe) id: string) {
    return this.files.get(user.userId, id);
  }
  @Post(':id/uploads')
  @ApiOperation({
    summary: '파일 업로드',
    description:
      'JPG/JPEG/PNG 10MiB, PDF 20MiB 이하. 증빙은 파일+링크 합산 10개, 로고/대표 이미지는 이미지 1개. 업로드 완료 후에만 ID를 발급한다.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 10,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({ type: [AttachmentResDto] })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      limits: { fileSize: PDF_LIMIT, files: 10, fields: 0, parts: 10 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.files.upload(user.userId, id, files);
  }
  @Post(':id/links')
  @ApiOperation({
    summary: 'HTTPS 외부 링크 등록 (서버에서 URL에 접속하지 않음)',
  })
  @ApiCreatedResponse({ type: AttachmentResDto })
  link(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: CreateLinkReqDto,
  ) {
    return this.files.addLink(user.userId, id, dto.url);
  }
  @Put(':id')
  @ApiOperation({
    summary: '완료 자료 선택과 설명 저장',
    description:
      '자기 작성 묶음에 업로드 완료된 ID만 허용. 임시 저장은 validateStep=false, 다음 단계는 true.',
  })
  @ApiOkResponse({ type: CollectionResDto })
  save(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: SaveCollectionReqDto,
  ) {
    return this.files.save(user.userId, id, dto);
  }
  @Delete(':id/attachments/:attachmentId')
  @ApiOperation({ summary: '파일 또는 외부 링크 삭제' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Param('attachmentId', ParseUuidPipe)
    attachmentId: string,
  ) {
    return this.files.remove(user.userId, id, attachmentId);
  }
  @Get(':id/attachments/:attachmentId/content')
  @ApiOperation({ summary: '소유자 전용 파일 다운로드' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUuidPipe) id: string,
    @Param('attachmentId', ParseUuidPipe)
    attachmentId: string,
  ) {
    const file = await this.files.download(user.userId, id, attachmentId);
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: 'attachment',
      length: file.body.length,
    });
  }
}
