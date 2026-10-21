import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class VerifyPasswordResetReqDto {
  @ApiProperty({ description: '재설정 링크의 token 값' })
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @IsNotEmpty({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(200, { message: INVALID_REQUEST_MESSAGE })
  token: string;
}
