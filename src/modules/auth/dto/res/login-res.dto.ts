import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ type: LoginUserResDto })
  user: LoginUserResDto;
}
