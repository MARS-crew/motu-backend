import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_MESSAGE,
  PASSWORD_PATTERN,
} from '../../../users/users.constants.js';

export class ChangeAdminPasswordReqDto {
  @ApiProperty({
    description: '현재 비밀번호 (최초 변경이면 메일로 받은 임시 비밀번호)',
    example: 'Tmp#a1b2c3d4',
  })
  @IsString({ message: '현재 비밀번호를 입력해 주세요.' })
  @MinLength(1, { message: '현재 비밀번호를 입력해 주세요.' })
  currentPassword: string;

  @ApiProperty({
    description: '새 비밀번호 (8~20자, 영문·숫자·특수문자 각 1개 이상)',
    example: 'motuadmin2!',
  })
  @IsString({ message: PASSWORD_MESSAGE })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
