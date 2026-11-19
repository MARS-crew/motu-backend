import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { AdminReasonReqDto } from '../../../../common/dto/admin-reason-req.dto.js';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

/** 거래 중지 (ADM-PRD-04). 사유는 관리자 활동 이력에, 안내문은 사용자 상품 상세에 쓴다. */
export class PauseStockReqDto extends AdminReasonReqDto {
  @ApiPropertyOptional({
    description: '사용자 안내문 (200자 이내). 사용자 상품 상세에 표시',
    example: '가격 데이터 점검으로 거래를 일시 중지합니다.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(200, { message: '사용자 안내문은 200자 이내로 입력해 주세요.' })
  notice?: string;

  @ApiPropertyOptional({
    description:
      '이상 거래 상세(ADM-MON-02)에서 넘어온 경우 이상 거래 ID. 보내면 거래 중지와 함께 그 이상 거래를 처리완료한다.',
    example: 7,
  })
  @IsOptional()
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  anomalyId?: number;
}
