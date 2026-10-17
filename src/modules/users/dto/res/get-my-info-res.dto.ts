import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, UserStatus } from '../../../../generated/prisma/client.js';

export class GetMyInfoResDto {
  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 'motuuser' })
  loginId: string;

  @ApiProperty({ example: '모투테스터' })
  nickname: string;

  @ApiProperty({ example: 'user@motu.test' })
  email: string;

  @ApiPropertyOptional({
    description: '연락처 (하이픈 없음)',
    example: '01012345678',
    nullable: true,
  })
  phoneNumber: string | null;

  @ApiProperty({ description: '역할', enum: Role, example: Role.USER })
  role: Role;

  @ApiProperty({
    description: '회원 상태',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  userStatus: UserStatus;
}
