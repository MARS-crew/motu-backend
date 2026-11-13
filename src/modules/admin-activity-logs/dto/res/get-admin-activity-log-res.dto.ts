import { ApiProperty } from '@nestjs/swagger';
import { AdminActivityLogItemResDto } from './get-admin-activity-logs-res.dto.js';

export class GetAdminActivityLogResDto extends AdminActivityLogItemResDto {
  @ApiProperty({
    description: '변경 전 값 { 항목: 값 }',
    example: { tradeStatus: 'ACTIVE' },
    nullable: true,
    type: Object,
  })
  before: Record<string, unknown> | null;

  @ApiProperty({
    description: '변경 후 값 { 항목: 값 }',
    example: { tradeStatus: 'PAUSED' },
    nullable: true,
    type: Object,
  })
  after: Record<string, unknown> | null;

  @ApiProperty({
    description: '처리 사유',
    example: '가격 데이터 점검',
    nullable: true,
    type: String,
  })
  reason: string | null;

  @ApiProperty({
    description: '접속 IP (뒤 두 자리 가림)',
    example: '192.168.***.***',
    nullable: true,
    type: String,
  })
  ipAddress: string | null;
}
