import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AnomalyAction } from '../../../../generated/prisma/client.js';

/** [조치 내용 확인] (ADM-MON-02 6번). 확정은 넘어간 화면(거래 중지·회원 상태 변경)에서 한다. */
export class ReviewAnomalyReqDto {
  @ApiProperty({
    description:
      '넘어갈 조치. STOCK_PAUSE 상품 거래 중지, USER_BLOCK 회원 정지. 이상 없음은 dismiss로 처리한다.',
    enum: [AnomalyAction.STOCK_PAUSE, AnomalyAction.USER_BLOCK],
    example: AnomalyAction.STOCK_PAUSE,
  })
  @IsIn([AnomalyAction.STOCK_PAUSE, AnomalyAction.USER_BLOCK], {
    message: '조치 유형을 선택해 주세요.',
  })
  action: AnomalyAction;
}
