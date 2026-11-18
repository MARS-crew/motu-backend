import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, Length, MaxLength } from 'class-validator';
import { InquiryType } from '../../../../generated/prisma/client.js';
import { INQUIRY_CONTENT_MAX_LENGTH } from '../../inquiries.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** 로그인·비밀번호·회원 ID를 받지 않는 USR-AUTH-10 접수. */
export class CreateAccountInquiryReqDto {
  @ApiProperty({
    enum: InquiryType,
    example: InquiryType.PHONE_UNAVAILABLE,
    description:
      '진입 화면의 유형: LOGIN_FAILED_LOCKED(잠금), SUSPENDED(정지), PHONE_UNAVAILABLE(등록 휴대폰 사용 불가). 계정 상태 검증을 의미하지 않는다.',
  })
  @IsEnum(InquiryType, { message: '계정·인증 문의 유형을 선택해 주세요.' })
  inquiryType: InquiryType;

  @ApiProperty({
    example: 'reply@example.com',
    description: '답변을 받을 이메일. 회원 확인·계정 연결에는 사용하지 않는다.',
    maxLength: 255,
  })
  @Transform(trim)
  @IsString({ message: '회신 이메일을 입력해 주세요.' })
  @IsEmail({}, { message: '올바른 회신 이메일을 입력해 주세요.' })
  @MaxLength(255, { message: '회신 이메일은 255자 이하로 입력해 주세요.' })
  replyEmail: string;

  @ApiProperty({
    example: '등록한 휴대폰을 사용할 수 없습니다. 변경 절차를 안내해 주세요.',
    description:
      '앞뒤 공백 제거 후 1~5000자. 비밀번호·인증번호·휴대폰 전체 번호 등 민감정보는 입력하지 마세요.',
    minLength: 1,
    maxLength: INQUIRY_CONTENT_MAX_LENGTH,
  })
  @Transform(trim)
  @IsString({ message: '문의 내용을 입력해 주세요.' })
  @Length(1, INQUIRY_CONTENT_MAX_LENGTH, {
    message: '문의 내용은 1자 이상 5000자 이하로 입력해 주세요.',
  })
  content: string;
}
