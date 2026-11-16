import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../../../../generated/prisma/client.js';

export class AdminUserItemResDto {
  @ApiProperty({ example: 6 })
  userId: number;

  @ApiProperty({ example: 'sunjung01' })
  loginId: string;

  @ApiProperty({ example: '선정' })
  nickname: string;

  @ApiProperty({ description: '가린 이메일', example: 'su*******@mail.com' })
  email: string;

  @ApiProperty({ description: '가입일시', example: '2026-09-01T03:00:00.000Z' })
  createDate: Date;

  @ApiProperty({
    description: '회원 상태 (ACTIVE 정상, LOCKED 잠금, BLOCKED 정지)',
    enum: UserStatus,
  })
  userStatus: UserStatus;

  @ApiProperty({
    description: '최근 접속(로그인)일시. 로그인한 적이 없으면 null',
    example: '2026-09-06T11:14:00.000Z',
    nullable: true,
    type: Date,
  })
  lastLoginDate: Date | null;
}

export class GetAdminUsersResDto {
  @ApiProperty({ type: [AdminUserItemResDto], description: '가입일 최신순' })
  items: AdminUserItemResDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  size: number;

  @ApiProperty({ description: '전체 건수', example: 23 })
  totalCount: number;
}
