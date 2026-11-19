import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const AnomalyErrors = {
  NOT_FOUND: {
    code: 'ANOMALY_NOT_FOUND',
    message: '존재하지 않는 이상 거래입니다.',
    status: HttpStatus.NOT_FOUND,
  },
  ALREADY_RESOLVED: {
    code: 'ANOMALY_ALREADY_RESOLVED',
    message: '이미 처리가 끝난 이상 거래입니다.',
    status: HttpStatus.CONFLICT,
  },
  /** 거래 중지는 그 이상 거래의 상품, 회원 정지는 그 이상 거래의 회원에게만 할 수 있다. */
  TARGET_MISMATCH: {
    code: 'ANOMALY_TARGET_MISMATCH',
    message: '이상 거래의 대상과 조치 대상이 다릅니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  /** 회원 상태 변경에서 정지가 아닌 상태로 이상 거래를 처리하려는 경우 */
  INVALID_ACTION: {
    code: 'ANOMALY_INVALID_ACTION',
    message:
      '이상 거래 조치는 상품 거래 중지, 회원 정지, 이상 없음만 할 수 있습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  INVALID_PERIOD: {
    code: 'ANOMALY_INVALID_PERIOD',
    message:
      '발생 기간을 다시 확인해 주세요. 시작은 종료보다 늦을 수 없고 최대 1년까지 조회할 수 있습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
