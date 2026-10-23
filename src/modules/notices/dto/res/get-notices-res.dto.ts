import { ApiProperty } from '@nestjs/swagger';
import { NoticeType } from '../../../../generated/prisma/client.js';

export class NoticeItemResDto {
  @ApiProperty({ example: 3 })
  noticeId: number;

  @ApiProperty({
    description: '공지 구분 (SERVICE 전체 서비스 공지, STOCK 상품 공지)',
    enum: NoticeType,
    example: NoticeType.SERVICE,
  })
  type: NoticeType;

  @ApiProperty({ example: '약관 개정 안내' })
  title: string;

  @ApiProperty({ description: '중요 공지 여부 (중요 배지)', example: true })
  isImportant: boolean;

  @ApiProperty({ description: '게시일', example: '2026-10-21T00:00:00.000Z' })
  postDate: Date;
}

export class GetNoticesResDto {
  @ApiProperty({
    type: [NoticeItemResDto],
    description: '중요 공지 먼저, 그다음 최근 게시순',
  })
  items: NoticeItemResDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  size: number;

  @ApiProperty({ description: '전체 건수', example: 7 })
  totalCount: number;
}
