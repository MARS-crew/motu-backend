import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { ParseUuidPipe } from '../../common/pipes/parse-uuid.pipe.js';
import { Role } from '../../generated/prisma/client.js';
import { GetAdminListingApplicationsReqDto } from './dto/req/get-admin-listing-applications-req.dto.js';
import {
  AdminListingApplicationResDto,
  GetAdminListingApplicationsResDto,
} from './dto/res/admin-listing-application-res.dto.js';
import { ListingApplicationsAdminService } from './listing-applications-admin.service.js';

@ApiTags('Admin - Listing Applications')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin/listing-applications')
export class ListingApplicationsAdminController {
  constructor(private readonly listings: ListingApplicationsAdminService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '심사 대상 상장 신청 목록' })
  @ApiOkResponse({ type: GetAdminListingApplicationsResDto })
  list(@Query() query: GetAdminListingApplicationsReqDto) {
    return this.listings.list(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: '심사 대상 상장 신청 상세 및 보완 이력' })
  @ApiOkResponse({ type: AdminListingApplicationResDto })
  detail(@Param('id', ParseIdPipe) id: number) {
    return this.listings.detail(id);
  }

  @Get(':id/attachments/:attachmentId/content')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: '심사 대상 상장 신청 첨부파일 다운로드' })
  @ApiProduces('application/pdf', 'image/png', 'image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(
    @Param('id', ParseIdPipe) id: number,
    @Param('attachmentId', ParseUuidPipe) attachmentId: string,
  ) {
    const file = await this.listings.download(id, attachmentId);
    const filename = (file.originalName || 'attachment').replace(
      /[\\/\p{Cc}]/gu,
      '_',
    );
    const encoded = encodeURIComponent(filename).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new StreamableFile(file.body, {
      type: file.contentType,
      length: file.body.length,
      disposition: `attachment; filename="attachment"; filename*=UTF-8''${encoded}`,
    });
  }
}
