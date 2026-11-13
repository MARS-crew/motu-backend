import { ApiProperty } from '@nestjs/swagger';
import {
  AdminActivityAction,
  AdminActivityResult,
  AdminActivityTarget,
} from '../../../../generated/prisma/client.js';

export class AdminActivityLogItemResDto {
  @ApiProperty({ example: 31 })
  activityLogId: number;

  @ApiProperty({
    description: '작업 시각',
    example: '2026-09-03T11:10:00.000Z',
  })
  createDate: Date;

  @ApiProperty({ description: '처리 관리자 user_id', example: 1 })
  adminId: number;

  @ApiProperty({ description: '처리 관리자 아이디', example: 'admin01' })
  adminLoginId: string;

  @ApiProperty({ description: '작업 대상', enum: AdminActivityTarget })
  targetType: AdminActivityTarget;

  @ApiProperty({
    description:
      '대상 ID. 화면 표시는 대상별 접두어를 붙인다 (예: 상품 PRD-018, 회원 USR-1024)',
    example: 18,
  })
  targetId: number;

  @ApiProperty({
    description: '처리 당시 대상 이름 (상품명, 아이디, 공지 제목 등)',
    example: 'SaaS Index',
    nullable: true,
    type: String,
  })
  targetLabel: string | null;

  @ApiProperty({ description: '수행 작업', enum: AdminActivityAction })
  action: AdminActivityAction;

  @ApiProperty({ description: '결과', enum: AdminActivityResult })
  result: AdminActivityResult;

  @ApiProperty({
    description: '변경 요약',
    example: '거래 가능 → 거래 중지',
    nullable: true,
    type: String,
  })
  summary: string | null;
}

export class GetAdminActivityLogsResDto {
  @ApiProperty({ type: [AdminActivityLogItemResDto], description: '최신순' })
  items: AdminActivityLogItemResDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  size: number;

  @ApiProperty({ description: '전체 건수', example: 3 })
  totalCount: number;
}
