import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { AdminReasonReqDto } from '../../../../common/dto/admin-reason-req.dto.js';
import { UserStatus } from '../../../../generated/prisma/client.js';

const MANAGEABLE_USER_STATUSES = [
  UserStatus.ACTIVE,
  UserStatus.LOCKED,
  UserStatus.BLOCKED,
];

export class ChangeUserStatusReqDto extends AdminReasonReqDto {
  @ApiProperty({
    description:
      '변경할 상태 (ACTIVE 정상, LOCKED 잠금, BLOCKED 정지). 현재 상태와 같으면 400',
    enum: MANAGEABLE_USER_STATUSES,
    example: UserStatus.BLOCKED,
  })
  @IsIn(MANAGEABLE_USER_STATUSES, {
    message: '변경 상태를 선택해 주세요.',
  })
  status: UserStatus;

  @ApiPropertyOptional({
    description:
      '이상 거래 상세(ADM-MON-02)에서 넘어온 경우 이상 거래 ID. status가 BLOCKED(정지)일 때만 보낼 수 있고, 정지와 함께 그 이상 거래를 처리완료한다.',
    example: 7,
  })
  @IsOptional()
  @IsInt({ message: INVALID_REQUEST_MESSAGE })
  @Min(1, { message: INVALID_REQUEST_MESSAGE })
  anomalyId?: number;
}
