import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const DashboardErrors = {
  INVALID_PERIOD: {
    code: 'DASHBOARD_INVALID_PERIOD',
    message:
      '조회 기간을 다시 확인해 주세요. 직접 설정은 시작일과 종료일이 필요하고, 시작일은 종료일보다 늦을 수 없으며 종료일은 오늘까지입니다.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
