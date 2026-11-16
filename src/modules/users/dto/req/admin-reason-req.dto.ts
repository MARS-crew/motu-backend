import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { ADMIN_REASON_MAX_LENGTH } from '../../users.constants.js';

const REASON_MESSAGE = '사유 입력은 필수입니다.';

/** 관리자 처리 사유. 계정 잠금 해제 요청에 그대로 쓰고, 상태 변경 요청이 상속한다. */
export class AdminReasonReqDto {
  @ApiProperty({
    description: `처리 사유 (1~${ADMIN_REASON_MAX_LENGTH}자). 관리자 활동 이력에 남는다.`,
    example: '본인 확인 완료 후 계정 잠금 해제',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: REASON_MESSAGE })
  @Length(1, ADMIN_REASON_MAX_LENGTH, {
    message: `사유는 1~${ADMIN_REASON_MAX_LENGTH}자로 입력해 주세요.`,
  })
  reason: string;
}
