import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const SearchHistoryErrors = {
  NOT_FOUND: {
    code: 'SEARCH_HISTORY_NOT_FOUND',
    message: '이미 삭제된 검색어입니다.',
    status: HttpStatus.NOT_FOUND,
  },
} as const satisfies Record<string, ErrorDefinition>;
