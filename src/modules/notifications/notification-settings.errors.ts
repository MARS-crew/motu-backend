import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const NotificationSettingsErrors = {
  NOTHING_TO_UPDATE: {
    code: 'NOTIFICATION_SETTINGS_NOTHING_TO_UPDATE',
    message: '변경할 알림 설정을 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  NIGHT_REQUIRES_PUSH: {
    code: 'NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH',
    message: '전체 푸시 알림을 켠 뒤 야간 푸시 수신 설정을 변경해 주세요.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
