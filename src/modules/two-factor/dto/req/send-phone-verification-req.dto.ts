import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

export class SendPhoneVerificationReqDto {
  @ApiProperty({
    description: '등록할 휴대폰 번호 (하이픈 유무 무관)',
    example: '010-1234-5678',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/-/g, '') : value,
  )
  @Matches(/^01[016789]\d{7,8}$/, {
    message: '휴대폰 번호 형식이 올바르지 않습니다.',
  })
  phoneNumber: string;
}
