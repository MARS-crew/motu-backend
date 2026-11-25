import { ApiProperty } from '@nestjs/swagger';

export class InitialGrantHistoryItemResDto {
  @ApiProperty({ type: 'integer' })
  activityLogId: number;

  @ApiProperty({ type: 'integer', example: 3_000_000 })
  beforeAmount: number;

  @ApiProperty({ type: 'integer', example: 5_000_000 })
  afterAmount: number;

  @ApiProperty({ type: 'integer', example: 1 })
  beforeVersion: number;

  @ApiProperty({ type: 'integer', example: 2 })
  afterVersion: number;

  @ApiProperty()
  reason: string;

  @ApiProperty({ type: 'integer' })
  adminId: number;

  @ApiProperty()
  adminLoginId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createDate: Date;
}

export class GetInitialGrantHistoryResDto {
  @ApiProperty({ type: [InitialGrantHistoryItemResDto] })
  items: InitialGrantHistoryItemResDto[];

  @ApiProperty({ type: 'integer' })
  page: number;

  @ApiProperty({ type: 'integer' })
  size: number;

  @ApiProperty({ type: 'integer' })
  totalCount: number;
}
