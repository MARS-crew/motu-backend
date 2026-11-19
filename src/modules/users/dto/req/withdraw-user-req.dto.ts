import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WithdrawUserReqDto {
  @ApiProperty({
    description: '회원 탈퇴 사유',
    maxLength: 50,
    example: '서비스 이용 빈도가 낮아졌습니다.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: '탈퇴 사유를 입력해 주세요.' })
  @MaxLength(50, { message: '탈퇴 사유는 50자 이내로 입력해 주세요.' })
  reason: string;
}
