import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const AdminActivityLogErrors = {
  NOT_FOUND: {
    code: 'ADMIN_ACTIVITY_LOG_NOT_FOUND',
    message: '존재하지 않는 활동 이력입니다.',
    status: HttpStatus.NOT_FOUND,
  },
  ACTION_TARGET_MISMATCH: {
    code: 'ADMIN_ACTIVITY_LOG_ACTION_TARGET_MISMATCH',
    message: '선택한 작업 대상에서 할 수 없는 수행 작업입니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  TARGET_TYPE_REQUIRED: {
    code: 'ADMIN_ACTIVITY_LOG_TARGET_TYPE_REQUIRED',
    message: '대상 ID로 조회하려면 작업 대상을 함께 선택해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  INVALID_PERIOD: {
    code: 'ADMIN_ACTIVITY_LOG_INVALID_PERIOD',
    message:
      '작업 기간을 다시 확인해 주세요. 시작은 종료보다 늦을 수 없고 최대 1년까지 조회할 수 있습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
