import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const NoticeErrors = {
  NOT_FOUND: {
    code: 'NOTICE_NOT_FOUND',
    message: '존재하지 않거나 게시가 끝난 공지입니다.',
    status: HttpStatus.NOT_FOUND,
  },
} as const satisfies Record<string, ErrorDefinition>;
