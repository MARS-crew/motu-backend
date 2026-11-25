import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const PointSettingsErrors = {
  CONCURRENT_UPDATE: {
    code: 'POINT_SETTINGS_CONCURRENT_UPDATE',
    message:
      '다른 관리자가 설정을 변경했습니다. 최신 설정을 조회한 후 다시 시도해 주세요.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
