import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendLoginVerificationReqDto {
  @ApiProperty({ description: '로그인 응답의 loginToken' })
  @IsString()
  @IsNotEmpty()
  loginToken: string;
}
