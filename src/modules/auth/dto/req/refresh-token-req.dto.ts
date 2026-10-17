import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenReqDto {
  @ApiProperty({ description: '로그인 시 발급받은 Refresh 토큰' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refreshToken: string;
}
