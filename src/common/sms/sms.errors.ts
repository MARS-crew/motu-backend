import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../exceptions/business.exception.js';

export const SmsErrors = {
  /** SMS 서비스 장애·시간 초과·발송 설정 없음 등으로 보내지 못한 경우 */
  SEND_FAILED: {
    code: 'SMS_SEND_FAILED',
    message: 'SMS 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
} as const satisfies Record<string, ErrorDefinition>;
