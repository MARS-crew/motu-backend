import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { AdminReasonReqDto } from '../../../../common/dto/admin-reason-req.dto.js';

export class UpdateInitialGrantReqDto extends AdminReasonReqDto {
  @ApiProperty({
    description: '이후 신규 가입자에게 지급할 포인트 (양의 안전한 정수)',
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
    example: 5_000_000,
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amount: number;

  @ApiProperty({
    description: '조회한 현재 설정 버전. 다른 관리자가 먼저 변경하면 409',
    type: 'integer',
    minimum: 1,
    maximum: 2_147_483_646,
    example: 1,
  })
  @IsInt()
  @Min(1)
  @Max(2_147_483_646)
  expectedVersion: number;
}
