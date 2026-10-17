import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyPasswordResetReqDto {
  @ApiProperty({ description: '재설정 링크의 token 값' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;
}
