import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const AccountErrors = {
  NOT_FOUND: {
    code: 'ACCOUNT_NOT_FOUND',
    message: '계좌가 존재하지 않습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  POINT_GRANT_TOO_SOON: {
    code: 'POINT_GRANT_TOO_SOON',
    message: '포인트 지급 후 24시간이 지나지 않았습니다.',
    status: HttpStatus.CONFLICT,
  },
  POINT_RESET_NOT_ALLOWED: {
    code: 'POINT_RESET_NOT_ALLOWED',
    message: '포인트 리셋 조건을 충족하지 않습니다.',
    status: HttpStatus.CONFLICT,
  },
  INSUFFICIENT_CASH: {
    code: 'ACCOUNT_INSUFFICIENT_CASH',
    message: '사용 가능 포인트보다 많이 차감할 수 없습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  /** 같은 계좌를 동시에 갱신해 버전이 맞지 않는 경우 */
  CONCURRENT_UPDATE: {
    code: 'ACCOUNT_CONCURRENT_UPDATE',
    message: '다른 요청을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
