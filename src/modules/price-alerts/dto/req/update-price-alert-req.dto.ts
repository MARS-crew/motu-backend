import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdatePriceAlertReqDto {
  @ApiProperty({
    description:
      '설정 가격 (P). 상품의 호가 단위 배수이고 최소 주문 가격 이상이며 현재가와 달라야 한다.',
    example: 7_000,
  })
  @IsInt({ message: '설정 가격은 1 이상의 정수로 입력해 주세요.' })
  @Min(1, { message: '설정 가격은 1 이상의 정수로 입력해 주세요.' })
  @Max(Number.MAX_SAFE_INTEGER, { message: '설정 가격이 너무 큽니다.' })
  targetPrice: number;
}
