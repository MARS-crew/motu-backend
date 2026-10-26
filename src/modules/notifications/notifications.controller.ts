import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe.js';
import { GetNotificationsReqDto } from './dto/req/get-notifications-req.dto.js';
import {
  GetNotificationsResDto,
  GetUnreadCountResDto,
  NotificationResDto,
} from './dto/res/notification-res.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: '내 알림 목록',
    description: '최신 발생순. 목록 조회만으로는 읽음 상태가 바뀌지 않는다.',
  })
  @ApiOkResponse({ type: GetNotificationsResDto })
  list(@CurrentUser() user: AuthUser, @Query() query: GetNotificationsReqDto) {
    return this.notifications.list(user.userId, query.page, query.size);
  }

  @Get('unread-count')
  @ApiOperation({ summary: '내 미확인 알림 수' })
  @ApiOkResponse({ type: GetUnreadCountResDto })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.userId);
  }

  @Patch(':notificationId/read')
  @ApiOperation({
    summary: '내 알림 읽음 처리',
    description:
      '선택한 알림만 읽음 처리한다. 재요청해도 최초 읽음 시각을 보존한다.',
  })
  @ApiOkResponse({ type: NotificationResDto })
  @ApiNotFoundResponse({
    description: 'NOTIFICATION_NOT_FOUND (타인 알림 포함)',
  })
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('notificationId', ParseIdPipe) id: number,
  ) {
    return this.notifications.markRead(user.userId, id);
  }
}
