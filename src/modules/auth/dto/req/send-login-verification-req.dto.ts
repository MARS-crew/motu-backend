import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class SendLoginVerificationReqDto {
  @ApiProperty({ description: '로그인 응답의 loginToken' })
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @IsNotEmpty({ message: INVALID_REQUEST_MESSAGE })
  loginToken: string;
}
