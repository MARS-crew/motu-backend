import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../users.constants.js';

export class SendEmailVerificationReqDto {
  @ApiProperty({ description: '가입 이메일', example: 'name@example.com' })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255)
  email: string;
}
