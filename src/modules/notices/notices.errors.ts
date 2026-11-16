import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const NoticeErrors = {
  ADMIN_NOT_FOUND: {
    code: 'NOTICE_ADMIN_NOT_FOUND',
    message: '관리할 수 있는 공지사항을 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  INVALID_PERIOD: {
    code: 'NOTICE_INVALID_PERIOD',
    message: '게시 종료 일시는 게시 시작 일시보다 늦어야 합니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  PIN_LIMIT_EXCEEDED: {
    code: 'NOTICE_PIN_LIMIT_EXCEEDED',
    message: '같은 시간에 상단 고정할 수 있는 공지사항은 최대 3개입니다.',
    status: HttpStatus.CONFLICT,
  },
  NOT_FOUND: {
    code: 'NOTICE_NOT_FOUND',
    message: '존재하지 않거나 게시가 끝난 공지입니다.',
    status: HttpStatus.NOT_FOUND,
  },
} as const satisfies Record<string, ErrorDefinition>;
