import { ApiProperty } from '@nestjs/swagger';
import { NoticeItemResDto } from './get-notices-res.dto.js';

export class GetNoticeResDto extends NoticeItemResDto {
  @ApiProperty({
    description: '공지 내용 (줄바꿈 포함 텍스트)',
    example:
      '안녕하세요. 모투(MOTU)입니다.\n\n서비스 이용약관이 개정되어 안내드립니다.',
  })
  content: string;
}
