import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      '기기 ID. 앱·웹이 처음 실행할 때 UUID를 만들어 저장해 두고 매번 같은 값을 보낸다. 신뢰하지 않은 기기면 추가 확인이 필요하다. 보내지 않으면 기기 확인을 건너뛴다(프론트 연동 전까지만).',
    example: '3f2b8c1e-6a4d-4e2f-9b7a-1c5d8e9f0a12',
  })
  @IsOptional()
  @IsUUID('all', { message: '기기 ID 형식이 올바르지 않습니다.' })
  deviceId?: string;
}
