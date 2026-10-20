import { ApiProperty } from '@nestjs/swagger';

export class ResetPointResDto {
  @ApiProperty({ description: '리셋 전 보유 포인트', example: 200_000 })
  cashBefore: number;

  @ApiProperty({ description: '리셋 후 보유 포인트', example: 3_000_000 })
  cashAfter: number;

  @ApiProperty({ example: '2026-10-20T10:19:00.000Z' })
  resetAt: Date;

  @ApiProperty({
    description: '다음 리셋 가능 시각',
    example: '2026-10-27T10:19:00.000Z',
  })
  nextAvailableAt: Date;
}
