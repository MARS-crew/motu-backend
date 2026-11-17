import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { AdminReasonReqDto } from '../../../../common/dto/admin-reason-req.dto.js';

/** 상품 종료 (ADM-PRD-05). 종료 사유와 사용자 안내문 모두 필수다. */
export class CloseStockReqDto extends AdminReasonReqDto {
  @ApiProperty({
    description:
      '사용자 안내문 (1~200자). 사용자 상품 상세의 거래 종료 안내에 표시',
    example: '2026.09.10 00:00부로 거래가 종료됩니다.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: '사용자 안내문을 입력해 주세요.' })
  @Length(1, 200, { message: '사용자 안내문은 1~200자로 입력해 주세요.' })
  notice: string;
}
