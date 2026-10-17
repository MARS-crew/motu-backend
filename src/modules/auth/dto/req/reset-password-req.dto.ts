import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import {
  PASSWORD_MESSAGE,
  PASSWORD_PATTERN,
} from '../../../users/users.constants.js';
import { VerifyPasswordResetReqDto } from './verify-password-reset-req.dto.js';

export class ResetPasswordReqDto extends VerifyPasswordResetReqDto {
  @ApiProperty({
    description: '새 비밀번호 (8~20자, 영문·숫자·특수문자 각 1개 이상)',
    example: 'motunew1!',
  })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
