import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min, NotEquals } from 'class-validator';

export class AdjustCashReqDto {
  @ApiProperty({
    description:
      '조정할 포인트. 양수면 지급, 음수면 차감한다. 사용 가능 포인트보다 많이 차감할 수 없다.',
    example: 1_000_000,
  })
  @IsInt({
    message:
      '조정할 포인트는 -100,000,000 ~ 100,000,000 사이의 정수로 입력해 주세요.',
  })
  @NotEquals(0, { message: '조정할 포인트는 0이 아니어야 합니다.' })
  @Min(-100_000_000, {
    message:
      '조정할 포인트는 -100,000,000 ~ 100,000,000 사이의 정수로 입력해 주세요.',
  })
  @Max(100_000_000, {
    message:
      '조정할 포인트는 -100,000,000 ~ 100,000,000 사이의 정수로 입력해 주세요.',
  })
  amount: number;
}
