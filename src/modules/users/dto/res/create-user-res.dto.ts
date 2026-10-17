import { ApiProperty } from '@nestjs/swagger';
import { Role, UserStatus } from '../../../../generated/prisma/client.js';

export class CreateUserResDto {
  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 'motu01' })
  loginId: string;

  @ApiProperty({ example: '모투투자' })
  nickname: string;

  @ApiProperty({
    description: '회원 상태',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  userStatus: UserStatus;

  @ApiProperty({ description: '역할', enum: Role, example: Role.USER })
  role: Role;

  @ApiProperty({ description: '지급된 초기 포인트', example: 3000000 })
  cash: number;
}
