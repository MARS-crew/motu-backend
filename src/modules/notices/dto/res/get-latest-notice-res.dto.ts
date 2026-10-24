import { ApiPropertyOptional } from '@nestjs/swagger';
import { NoticeItemResDto } from './get-notices-res.dto.js';

export class GetLatestNoticeResDto {
  @ApiPropertyOptional({
    type: NoticeItemResDto,
    description: '가장 최근에 게시된 공지. 게시 중인 공지가 없으면 null',
    nullable: true,
  })
  notice: NoticeItemResDto | null;
}
