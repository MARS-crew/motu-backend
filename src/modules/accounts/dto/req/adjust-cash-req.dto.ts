import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min, NotEquals } from 'class-validator';

export class AdjustCashReqDto {
  @ApiProperty({
    description:
      '조정할 포인트. 양수면 지급, 음수면 차감한다. 사용 가능 포인트보다 많이 차감할 수 없다.',
    example: 1_000_000,
  })
  @IsInt()
  @NotEquals(0, { message: '조정할 포인트는 0이 아니어야 합니다.' })
  @Min(-100_000_000)
  @Max(100_000_000)
  amount: number;
}
