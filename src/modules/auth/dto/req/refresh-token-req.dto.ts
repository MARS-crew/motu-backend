import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class RefreshTokenReqDto {
  @ApiProperty({ description: '로그인 시 발급받은 Refresh 토큰' })
  @IsString({ message: INVALID_REQUEST_MESSAGE })
  @IsNotEmpty({ message: INVALID_REQUEST_MESSAGE })
  @MaxLength(200, { message: INVALID_REQUEST_MESSAGE })
  refreshToken: string;
}
