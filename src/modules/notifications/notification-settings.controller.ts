import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user.type.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { UpdateNotificationSettingsReqDto } from './dto/req/update-notification-settings-req.dto.js';
import { NotificationSettingsResDto } from './dto/res/notification-settings-res.dto.js';
import { NotificationSettingsService } from './notification-settings.service.js';

@ApiTags('Notification Settings')
@ApiBearerAuth()
@Controller('users/me/notification-settings')
export class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  @ApiOperation({
    summary: '본인 푸시·야간 푸시 수신 설정 조회',
    description:
      'USR-MY-05. 저장된 야간 동의값은 전체 푸시 OFF 중에도 보존한다. canChangeNightPush=false이면 야간 토글을 비활성화한다. 야간은 한국 시간 21:00 이상~08:00 미만이다.',
  })
  @ApiOkResponse({ type: NotificationSettingsResDto })
  get(@CurrentUser() user: AuthUser) {
    return this.settings.get(user.userId);
  }

  @Patch()
  @ApiOperation({
    summary: '본인 푸시·야간 푸시 수신 설정 변경',
    description:
      '변경할 boolean 필드만 보낸다. 전체 푸시만 끄면 야간 동의값을 보존한다. 요청 반영 후 전체 푸시가 OFF라면 nightPushEnabled 포함 요청 전체를 409로 거절한다. ON과 야간 변경은 한 요청으로 가능하다. 앱 내 알림 저장·목록·읽음은 유지한다. FCM 발송·기기 권한 변경은 수행하지 않는다.',
  })
  @ApiOkResponse({ type: NotificationSettingsResDto })
  @ApiBadRequestResponse({
    description: 'BAD_REQUEST / NOTIFICATION_SETTINGS_NOTHING_TO_UPDATE',
  })
  @ApiConflictResponse({
    description: 'NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateNotificationSettingsReqDto,
  ) {
    return this.settings.update(user.userId, dto);
  }
}
