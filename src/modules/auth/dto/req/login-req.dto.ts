import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginReqDto {
  @ApiProperty({ description: '아이디', example: 'motuuser' })
  @IsString({ message: '아이디를 입력해 주세요.' })
  @IsNotEmpty({ message: '아이디를 입력해 주세요.' })
  @MaxLength(20, { message: '아이디 또는 비밀번호를 확인해 주세요.' })
  loginId: string;

  @ApiProperty({ description: '비밀번호', example: 'motuuser1!' })
  @IsString({ message: '비밀번호를 입력해 주세요.' })
  @IsNotEmpty({ message: '비밀번호를 입력해 주세요.' })
  @MaxLength(100, { message: '아이디 또는 비밀번호를 확인해 주세요.' })
  password: string;
}
