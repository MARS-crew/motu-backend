import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginReqDto {
  @ApiProperty({ description: '아이디', example: 'motuuser' })
  @IsString()
  @IsNotEmpty({ message: '아이디를 입력해 주세요.' })
  @MaxLength(20)
  loginId: string;

  @ApiProperty({ description: '비밀번호', example: 'motuuser1!' })
  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해 주세요.' })
  @MaxLength(100)
  password: string;
}
