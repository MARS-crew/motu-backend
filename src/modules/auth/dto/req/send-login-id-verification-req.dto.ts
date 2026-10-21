import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../users/users.constants.js';

export class SendLoginIdVerificationReqDto {
  @ApiProperty({ description: '가입 이메일', example: 'user@motu.test' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255, { message: '이메일 형식이 올바르지 않습니다.' })
  email: string;
}
