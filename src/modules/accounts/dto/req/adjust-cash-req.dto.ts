import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min, NotEquals } from 'class-validator';

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

  @ApiProperty({
    description: '처리 사유 (1~200자). 관리자 활동 이력에 남는다.',
    example: '운영 이벤트 지급',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: '처리 사유를 입력해 주세요.' })
  @Length(1, 200, { message: '처리 사유는 1~200자로 입력해 주세요.' })
  reason: string;
}
