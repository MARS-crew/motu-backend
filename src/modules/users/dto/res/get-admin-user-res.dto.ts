import { ApiProperty } from '@nestjs/swagger';
import { TwoFactorStatus } from '../../../../generated/prisma/client.js';
import { AdminUserItemResDto } from './get-admin-users-res.dto.js';

export class AdminUserSecurityResDto {
  @ApiProperty({
    description:
      '이메일 인증 여부. 가입할 때 이메일 인증을 마쳐야 하므로 항상 true',
    example: true,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: '2차 보안 상태 (NOT_SET 미설정, ENABLED 설정, DISABLED 해제)',
    enum: TwoFactorStatus,
  })
  twoFactorStatus: TwoFactorStatus;

  @ApiProperty({
    description: '2차 보안 휴대폰 (가림). 설정하지 않았으면 null',
    example: '010-****-1234',
    nullable: true,
    type: String,
  })
  twoFactorPhoneNumber: string | null;

  @ApiProperty({
    description: '최근 2차 보안 인증일시',
    example: '2026-09-06T10:42:00.000Z',
    nullable: true,
    type: Date,
  })
  twoFactorVerifiedDate: Date | null;

  @ApiProperty({
    description: '연속 로그인 실패 횟수. 5회가 되면 잠금',
    example: 0,
  })
  loginFailCount: number;
}

export class AdminUserAssetResDto {
  @ApiProperty({ description: '사용 가능 포인트', example: 2_345_678 })
  availableCash: number;

  @ApiProperty({
    description: '예약 포인트 (매수 주문에 묶여 회수할 수 없음)',
    example: 93_093,
  })
  lockedCash: number;

  @ApiProperty({ description: '보유 상품 수 (종)', example: 3 })
  holdingCount: number;

  @ApiProperty({ description: '미체결 주문 수', example: 2 })
  openOrderCount: number;
}

export class GetAdminUserResDto extends AdminUserItemResDto {
  @ApiProperty({ type: AdminUserSecurityResDto, description: '인증·계정' })
  security: AdminUserSecurityResDto;

  @ApiProperty({ type: AdminUserAssetResDto, description: '자산·활동' })
  asset: AdminUserAssetResDto;
}
