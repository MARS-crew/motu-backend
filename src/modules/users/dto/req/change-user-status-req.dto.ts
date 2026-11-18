import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { UserStatus } from '../../../../generated/prisma/client.js';
import { AdminReasonReqDto } from './admin-reason-req.dto.js';

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
  @IsIn(MANAGEABLE_USER_STATUSES, { message: '변경 상태를 선택해 주세요.' })
  status: (typeof MANAGEABLE_USER_STATUSES)[number];
}
