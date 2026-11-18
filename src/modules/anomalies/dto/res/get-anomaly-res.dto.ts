import { ApiProperty } from '@nestjs/swagger';
import { AnomalyAction } from '../../../../generated/prisma/client.js';
import { AnomalyItemResDto } from './get-anomalies-res.dto.js';

export class AnomalyHandlerResDto {
  @ApiProperty({ description: '처리 관리자 user_id', example: 1 })
  adminId: number;

  @ApiProperty({ description: '처리 관리자 아이디', example: 'admin01' })
  loginId: string;
}

export class GetAnomalyResDto extends AnomalyItemResDto {
  @ApiProperty({
    description: '상품 코드',
    example: 'SAAS',
    nullable: true,
    type: String,
  })
  stockCode: string | null;

  @ApiProperty({ description: '회원 닉네임', example: '민혁' })
  nickname: string;

  @ApiProperty({
    description: '관련 주문 ID. 주문 처리 실패·잔액 불일치는 null',
    example: 9031842,
    nullable: true,
    type: Number,
  })
  orderId: number | null;

  @ApiProperty({
    description: '관련 체결 ID. 비정상 가격 체결만 있다.',
    example: 9032201,
    nullable: true,
    type: Number,
  })
  tradeId: number | null;

  @ApiProperty({
    description: '탐지 근거 { 항목: 값 }. 유형별 항목은 API 명세서 참고',
    example: {
      orderQty: 8000,
      filledQty: 8000,
      basePrice: 12480,
      tradePrice: 18900,
      deviationPercent: 51.44,
      assetDifference: -51360000,
    },
  })
  evidence: Record<string, unknown>;

  @ApiProperty({
    description: '조치. 확인중이면 넘어간 조치, 처리완료면 확정한 조치',
    enum: AnomalyAction,
    nullable: true,
  })
  action: AnomalyAction | null;

  @ApiProperty({
    description: '조치 사유 (처리완료)',
    example: '가격 급등 원인 확인을 위해 거래를 임시 정지합니다.',
    nullable: true,
    type: String,
  })
  actionReason: string | null;

  @ApiProperty({
    type: AnomalyHandlerResDto,
    description: '처리 관리자 (확인중·처리완료)',
    nullable: true,
  })
  handledBy: AnomalyHandlerResDto | null;

  @ApiProperty({
    description: '처리일시 (확인중이면 넘어간 시각, 처리완료면 확정 시각)',
    nullable: true,
    type: Date,
  })
  handledDate: Date | null;
}
