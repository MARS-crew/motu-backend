import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { NICKNAME_MESSAGE, NICKNAME_PATTERN } from '../../users.constants.js';

export class ChangeNicknameReqDto {
  @ApiProperty({
    description: '새 닉네임 (2~10자 한글·영문·숫자)',
    example: '모투고수',
  })
  @Matches(NICKNAME_PATTERN, { message: NICKNAME_MESSAGE })
  nickname: string;
}
