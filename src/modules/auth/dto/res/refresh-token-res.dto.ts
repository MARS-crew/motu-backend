import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenResDto {
  @ApiProperty({
    description:
      'API 호출 시 `Authorization: Bearer <accessToken>`으로 보낸다.',
  })
  accessToken: string;

  @ApiProperty({ description: 'Access 토큰 유효시간 (초)', example: 900 })
  accessTokenExpiresIn: number;

  @ApiProperty({
    description: '재발급용 토큰. 재발급할 때마다 새 값으로 바뀐다.',
  })
  refreshToken: string;
}
