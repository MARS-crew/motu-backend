import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../../../../generated/prisma/client.js';

export class NotificationResDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ example: 'PLI·20주·매수 주문이 체결되었습니다.' })
  content: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      '이벤트 당시 값. ORDER: tradeId/orderId/stockId/stockName/side/quantity/price, PRICE: alertId/revision/stockId/stockName/targetPrice/reachedPrice, LISTING_DRAFT_EXPIRING: applicationId/serviceName/expiresAt. 금액·수량은 문자열.',
  })
  payload: Record<string, unknown>;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty({ type: Date, nullable: true, description: '최초 읽음 시각' })
  readAt: Date | null;

  @ApiProperty({ description: '이벤트 발생 시각 (ISO 8601)' })
  createDate: Date;
}

export class GetNotificationsResDto {
  @ApiProperty({
    type: [NotificationResDto],
    description: '발생 시각 내림차순, 같은 시각이면 ID 내림차순',
  })
  items: NotificationResDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  size: number;

  @ApiProperty()
  totalCount: number;
}

export class GetUnreadCountResDto {
  @ApiProperty({ description: '내 전체 미확인 알림 수', example: 3 })
  unreadCount: number;
}
