import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetPointGrantResDto {
  @ApiProperty({ description: '1회 지급 포인트', example: 100_000 })
  amount: number;

  @ApiProperty({ description: '지금 지급받을 수 있는지', example: false })
  available: boolean;

  @ApiPropertyOptional({
    description: '다음 지급 가능 시각. 지금 받을 수 있으면 null',
    example: '2026-10-21T10:19:00.000Z',
    nullable: true,
  })
  nextAvailableAt: Date | null;

  @ApiPropertyOptional({
    description: '마지막 지급 시각. 받은 적이 없으면 null',
    example: '2026-10-20T10:19:00.000Z',
    nullable: true,
  })
  lastGrantedAt: Date | null;
}
