import { ApiProperty } from '@nestjs/swagger';

export class FindLoginIdResDto {
  @ApiProperty({ description: '일부를 가린 아이디', example: 'min***01' })
  maskedLoginId: string;
}
