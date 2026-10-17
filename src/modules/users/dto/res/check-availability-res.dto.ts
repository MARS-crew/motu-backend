import { ApiProperty } from '@nestjs/swagger';

export class CheckAvailabilityResDto {
  @ApiProperty({ description: '사용 가능 여부', example: true })
  available: boolean;
}
