import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  LOGIN_ID_MESSAGE,
  LOGIN_ID_PATTERN,
  NICKNAME_MESSAGE,
  NICKNAME_PATTERN,
  PASSWORD_MESSAGE,
  PASSWORD_PATTERN,
  normalizeEmail,
} from '../../users.constants.js';

export class CreateUserReqDto {
  @ApiProperty({
    description: '아이디 (5~20자 영문 소문자·숫자)',
    example: 'motu01',
  })
  @Matches(LOGIN_ID_PATTERN, { message: LOGIN_ID_MESSAGE })
  loginId: string;

  @ApiProperty({
    description: '비밀번호 (8~20자, 영문·숫자·특수문자 각 1개 이상)',
    example: 'motu1234!',
  })
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({
    description: '닉네임 (2~10자 한글·영문·숫자)',
    example: '모투투자',
  })
  @Matches(NICKNAME_PATTERN, { message: NICKNAME_MESSAGE })
  nickname: string;

  @ApiProperty({
    description: '가입 이메일 (인증 완료된 이메일)',
    example: 'name@example.com',
  })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255, { message: '이메일 형식이 올바르지 않습니다.' })
  email: string;

  @ApiPropertyOptional({
    description: '휴대폰 번호 (선택, 하이픈 유무 무관)',
    example: '010-1234-5678',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/-/g, '') : value,
  )
  @Matches(/^01[016789]\d{7,8}$/, {
    message: '휴대폰 번호 형식이 올바르지 않습니다.',
  })
  phoneNumber?: string;

  @ApiProperty({ description: '생년월일 (YYYY-MM-DD)', example: '2000-01-01' })
  @IsDateString(
    { strict: true },
    { message: '생년월일 형식이 올바르지 않습니다.' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: '생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.',
  })
  birthDate: string;

  @ApiProperty({ description: '이용약관 동의 (필수)', example: true })
  @Equals(true, { message: '이용약관에 동의해 주세요.' })
  termsAgreed: boolean;

  @ApiProperty({ description: '개인정보 처리 동의 (필수)', example: true })
  @Equals(true, { message: '개인정보 처리에 동의해 주세요.' })
  privacyAgreed: boolean;

  @ApiProperty({ description: '마케팅 정보 수신 동의 (선택)', example: false })
  @IsBoolean({ message: '마케팅 정보 수신 동의 여부를 선택해 주세요.' })
  marketingAgreed: boolean;
}
