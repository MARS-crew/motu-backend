import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../../../../generated/prisma/client.js';

export class ChangeUserStatusResDto {
  @ApiProperty({ example: 6 })
  userId: number;

  @ApiProperty({ description: '변경 전 상태', enum: UserStatus })
  statusBefore: UserStatus;

  @ApiProperty({ description: '변경 후 상태', enum: UserStatus })
  statusAfter: UserStatus;
}
