import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateInquiryReqDto {
  @ApiProperty({
    description: '문의 제목 (공백 제거 후 1~100자)',
    example: '계정 잠금 해제 문의',
  })
  @Transform(trim)
  @IsString({ message: '문의 제목은 1자 이상 100자 이하로 입력해 주세요.' })
  @Length(1, 100, {
    message: '문의 제목은 1자 이상 100자 이하로 입력해 주세요.',
  })
  title: string;

  @ApiProperty({
    description: '문의 내용 (공백 제거 후 1~5000자)',
    example: '비밀번호 입력 실패로 계정이 잠겼습니다. 확인 부탁드립니다.',
  })
  @Transform(trim)
  @IsString({ message: '문의 내용은 1자 이상 5000자 이하로 입력해 주세요.' })
  @Length(1, 5000, {
    message: '문의 내용은 1자 이상 5000자 이하로 입력해 주세요.',
  })
  content: string;
}
