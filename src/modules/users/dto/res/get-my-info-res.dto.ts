import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Role,
  TwoFactorStatus,
  UserStatus,
} from '../../../../generated/prisma/client.js';

export class GetMyInfoResDto {
  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 'motuuser' })
  loginId: string;

  @ApiProperty({
    description: '회원은 닉네임, 관리자는 관리자명(없으면 닉네임·아이디)',
    example: '모투테스터',
  })
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

  @ApiProperty({
    description:
      '2차 보안 상태 (NOT_SET 미설정, ENABLED 설정 완료, DISABLED 해제). 마이페이지의 2차 보안 표시와 연락처 변경 가능 여부에 쓴다.',
    enum: TwoFactorStatus,
    example: TwoFactorStatus.ENABLED,
  })
  twoFactorStatus: TwoFactorStatus;
}
