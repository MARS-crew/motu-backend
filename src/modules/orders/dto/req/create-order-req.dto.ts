import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsUUID, Max, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { OrderSide } from '../../../../generated/prisma/client.js';

export class CreateOrderReqDto {
  @ApiProperty({
    description:
      '중복 요청 방지 키. 주문마다 새로 만든 UUID를 보내고, 응답을 못 받아 다시 보낼 때는 같은 값을 보낸다.',
    example: '3f2a9c1e-8b7d-4c5e-9f10-2a3b4c5d6e7f',
  })
  @IsUUID('all', { message: INVALID_REQUEST_MESSAGE })
  clientOrderId: string;

  @ApiProperty({ description: '상품 ID', example: 1 })
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  stockId: number;

  @ApiProperty({
    description: '주문 방향 (BUY 매수, SELL 매도)',
    enum: OrderSide,
    example: OrderSide.BUY,
  })
  @IsEnum(OrderSide, { message: INVALID_REQUEST_MESSAGE })
  side: OrderSide;

  @ApiProperty({
    description: '주문 가격 (P). 상품의 호가 단위 배수여야 한다.',
    example: 5_000,
  })
  @IsInt({ message: '주문 가격은 1 이상의 정수로 입력해 주세요.' })
  @Min(1, { message: '주문 가격은 1 이상의 정수로 입력해 주세요.' })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: '주문 가격이 너무 큽니다.',
  })
  price: number;

  @ApiProperty({ description: '주문 수량 (주)', example: 10 })
  @IsInt({ message: '주문 수량은 1 이상의 정수로 입력해 주세요.' })
  @Min(1, { message: '주문 수량은 1 이상의 정수로 입력해 주세요.' })
  @Max(Number.MAX_SAFE_INTEGER, {
    message: '주문 수량이 너무 큽니다.',
  })
  qty: number;
}
