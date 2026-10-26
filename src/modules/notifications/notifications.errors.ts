import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const NotificationErrors = {
  NOT_FOUND: {
    code: 'NOTIFICATION_NOT_FOUND',
    message: '알림을 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  INVALID_EVENT: {
    code: 'NOTIFICATION_INVALID_EVENT',
    message: '알림 생성에 필요한 이벤트 값이 올바르지 않습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
