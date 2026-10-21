import { ApiProperty } from '@nestjs/swagger';

export class SearchHistoryItemResDto {
  @ApiProperty({ example: 3 })
  searchHistoryId: number;

  @ApiProperty({ example: '클라우드' })
  keyword: string;

  @ApiProperty({
    description: '마지막으로 검색한 시각',
    example: '2026-10-21T10:19:00.000Z',
  })
  searchedAt: Date;
}

export class GetSearchHistoriesResDto {
  @ApiProperty({
    type: [SearchHistoryItemResDto],
    description: '최근 검색순, 최대 5개',
  })
  items: SearchHistoryItemResDto[];
}
