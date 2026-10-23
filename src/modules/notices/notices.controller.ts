import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { GetNoticesReqDto } from './dto/req/get-notices-req.dto.js';
import { GetLatestNoticeResDto } from './dto/res/get-latest-notice-res.dto.js';
import { GetNoticeResDto } from './dto/res/get-notice-res.dto.js';
import { GetNoticesResDto } from './dto/res/get-notices-res.dto.js';
import { NoticesService } from './notices.service.js';

@ApiTags('Notices')
@Controller('notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: '공지 목록',
    description:
      '게시 기간 안에 있는 공지만 조회한다. 중요 공지가 먼저 나오고, 그다음 최근 게시순이다. 페이지 번호 방식이다.',
  })
  @ApiOkResponse({ type: GetNoticesResDto })
  getNotices(@Query() query: GetNoticesReqDto): Promise<GetNoticesResDto> {
    return this.noticesService.getNotices(query.page, query.size);
  }

  @Public()
  @Get('latest')
  @ApiOperation({
    summary: '최신 공지 (홈)',
    description:
      '홈 화면의 공지 영역에 쓴다. 가장 최근에 게시된 공지 하나이며, 없으면 null이다.',
  })
  @ApiOkResponse({ type: GetLatestNoticeResDto })
  getLatestNotice(): Promise<GetLatestNoticeResDto> {
    return this.noticesService.getLatestNotice();
  }

  /** `:noticeId`가 latest를 가로채지 않도록 맨 아래에 둔다. */
  @Public()
  @Get(':noticeId')
  @ApiOperation({ summary: '공지 상세' })
  @ApiOkResponse({ type: GetNoticeResDto })
  @ApiNotFoundResponse({ description: 'NOTICE_NOT_FOUND' })
  getNotice(
    @Param('noticeId', ParseIdPipe) noticeId: number,
  ): Promise<GetNoticeResDto> {
    return this.noticesService.getNotice(noticeId);
  }
}
