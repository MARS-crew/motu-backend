import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../../generated/prisma/client.js';
import { RefreshTokenResDto } from './refresh-token-res.dto.js';

export class LoginUserResDto {
  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 'motuuser' })
  loginId: string;

  @ApiProperty({ example: '모투테스터' })
  nickname: string;

  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;
}

export class LoginResDto extends RefreshTokenResDto {
  @ApiProperty({ description: '로그인 완료면 false', example: false })
  verificationRequired: false;

  @ApiPropertyOptional({
    description:
      '관리자일 때만 내려준다. true면 임시 비밀번호 상태이므로 비밀번호 변경 화면으로 보낸다.',
    example: false,
  })
  passwordChangeRequired?: boolean;

  @ApiProperty({ type: LoginUserResDto })
  user: LoginUserResDto;
}
