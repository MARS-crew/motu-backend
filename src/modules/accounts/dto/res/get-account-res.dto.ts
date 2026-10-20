import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GetMyAccountResDto } from './get-my-account-res.dto.js';

/** 관리자용 회원 계좌 조회 응답 */
export class GetAccountResDto extends GetMyAccountResDto {
  @ApiProperty({ example: 2 })
  userId: number;

  @ApiPropertyOptional({
    description: '마지막 추가 포인트 지급 시각',
    example: '2026-10-20T10:19:00.000Z',
    nullable: true,
  })
  lastPointGrantAt: Date | null;

  @ApiPropertyOptional({
    description: '마지막 포인트 리셋 시각',
    example: null,
    nullable: true,
  })
  lastPointResetAt: Date | null;
}
