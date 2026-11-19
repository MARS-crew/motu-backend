import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AdminReasonReqDto } from '../../../../common/dto/admin-reason-req.dto.js';
import {
  ADMIN_CHANGEABLE_STATUSES,
  type AdminChangeableStatus,
} from '../../admin-accounts.constants.js';

export class ChangeAdminStatusReqDto extends AdminReasonReqDto {
  @ApiProperty({
    description: '변경 상태 (ACTIVE 정상, BLOCKED 정지)',
    enum: ADMIN_CHANGEABLE_STATUSES,
    example: 'BLOCKED',
  })
  @IsIn(ADMIN_CHANGEABLE_STATUSES, {
    message: '변경 상태는 정상 또는 정지 중에서 선택해 주세요.',
  })
  status: AdminChangeableStatus;
}
