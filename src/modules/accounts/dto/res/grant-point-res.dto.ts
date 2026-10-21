import { ApiProperty } from '@nestjs/swagger';

export class GrantPointResDto {
  @ApiProperty({ description: '지급 포인트', example: 100_000 })
  amount: number;

  @ApiProperty({ description: '지급 전 보유 포인트', example: 2_345_678 })
  cashBefore: number;

  @ApiProperty({ description: '지급 후 보유 포인트', example: 2_445_678 })
  cashAfter: number;

  @ApiProperty({ example: '2026-10-20T10:19:00.000Z' })
  grantedAt: Date;

  @ApiProperty({
    description: '다음 지급 가능 시각',
    example: '2026-10-21T10:19:00.000Z',
  })
  nextAvailableAt: Date;
}
