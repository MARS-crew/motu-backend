import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../users/users.constants.js';

export class RequestPasswordResetReqDto {
  @ApiProperty({ description: '아이디', example: 'motuuser' })
  @IsString()
  @IsNotEmpty({ message: '아이디를 입력해 주세요.' })
  @MaxLength(20)
  loginId: string;

  @ApiProperty({ description: '가입 이메일', example: 'user@motu.test' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255)
  email: string;
}
