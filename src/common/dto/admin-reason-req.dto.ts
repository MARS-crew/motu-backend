import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/** 관리자 처리 사유 최대 길이 */
export const ADMIN_REASON_MAX_LENGTH = 200;

const REASON_MESSAGE = '사유 입력은 필수입니다.';

/** 관리자 처리 사유. 사유만 받는 처리는 그대로 쓰고, 다른 값도 받는 요청은 상속한다. */
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
