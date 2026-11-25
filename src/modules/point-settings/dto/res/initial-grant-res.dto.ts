import { ApiProperty } from '@nestjs/swagger';

export class InitialGrantResDto {
  @ApiProperty({ type: 'integer', example: 3_000_000 })
  amount: number;

  @ApiProperty({ type: 'integer', example: 1 })
  version: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: '설정 준비 또는 마지막 변경 시각',
  })
  modifiedDate: Date;
}
