import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../../../../generated/prisma/client.js';

export class CreateAdminAccountResDto {
  @ApiProperty({ description: '관리자 user_id', example: 4 })
  userId: number;

  @ApiProperty({ description: '관리자 아이디', example: 'admin04' })
  loginId: string;

  @ApiProperty({ description: '관리자명', example: '최운영' })
  name: string;

  @ApiProperty({ description: '이메일', example: 'admin04@motu.app' })
  email: string;

  @ApiProperty({
    description: '담당 업무 (참고값). 없으면 null',
    example: '상장 심사',
    nullable: true,
  })
  duty: string | null;

  @ApiProperty({
    description: '계정 상태',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  userStatus: UserStatus;

  @ApiProperty({
    description: '임시 비밀번호 상태. 생성 직후에는 항상 true',
    example: true,
  })
  passwordChangeRequired: boolean;

  @ApiProperty({ description: '생성일시' })
  createDate: Date;
}
