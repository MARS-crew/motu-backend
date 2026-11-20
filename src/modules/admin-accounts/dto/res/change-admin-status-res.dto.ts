import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../../../../generated/prisma/client.js';

export class ChangeAdminStatusResDto {
  @ApiProperty({ description: '관리자 user_id', example: 3 })
  userId: number;

  @ApiProperty({ description: '변경 전 상태', enum: UserStatus })
  statusBefore: UserStatus;

  @ApiProperty({ description: '변경 후 상태', enum: UserStatus })
  statusAfter: UserStatus;
}
