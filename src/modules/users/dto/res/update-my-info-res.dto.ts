import { ApiProperty } from '@nestjs/swagger';
import { GetMyInfoResDto } from './get-my-info-res.dto.js';

export class UpdateMyInfoResDto extends GetMyInfoResDto {
  @ApiProperty({
    description:
      '비밀번호를 바꿔 모든 기기에서 로그아웃됐으면 true. 프론트는 저장된 토큰을 지우고 로그인 화면으로 보낸다.',
    example: false,
  })
  reloginRequired: boolean;
}
