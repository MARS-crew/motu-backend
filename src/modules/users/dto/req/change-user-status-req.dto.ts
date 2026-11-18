import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserStatus } from '../../../../generated/prisma/client.js';
import { AdminReasonReqDto } from '../../../../common/dto/admin-reason-req.dto.js';

export class ChangeUserStatusReqDto extends AdminReasonReqDto {
  @ApiProperty({
    description:
      '변경할 상태 (ACTIVE 정상, LOCKED 잠금, BLOCKED 정지). 현재 상태와 같으면 400',
    enum: UserStatus,
    example: UserStatus.BLOCKED,
  })
  @IsEnum(UserStatus, { message: '변경 상태를 선택해 주세요.' })
  status: UserStatus;
}
