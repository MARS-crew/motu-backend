import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckResDto {
  @ApiProperty({ description: '서버 상태', example: 'ok' })
  status: string;
}
