import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CursorPageReqDto } from '../../../../common/dto/cursor-page-req.dto.js';
import { MAX_SEARCH_KEYWORD_LENGTH } from '../../stocks.constants.js';

export class SearchStocksReqDto extends CursorPageReqDto {
  @ApiProperty({
    description: `검색어. 상품명·카테고리명 부분 일치 (최대 ${MAX_SEARCH_KEYWORD_LENGTH}자)`,
    example: '클라우드',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: '검색어를 입력해 주세요.' })
  @MaxLength(MAX_SEARCH_KEYWORD_LENGTH)
  keyword: string;
}
