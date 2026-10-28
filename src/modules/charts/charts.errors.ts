import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const ChartErrors = {
  INVALID_CURSOR: {
    code: 'CHART_INVALID_CURSOR',
    message: '차트를 처음부터 다시 불러와 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
