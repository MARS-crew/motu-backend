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
  REQUIRED_FIELDS: {
    code: 'NOTICE_REQUIRED_FIELDS',
    message:
      '게시하려면 공지 구분, 제목, 본문, 게시 시작 일시를 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  INVALID_TARGET: {
    code: 'NOTICE_INVALID_TARGET',
    message:
      '상품별 공지는 대상 상품을 선택하고, 전체 공지는 상품 ID를 비워 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  STOCK_NOT_FOUND: {
    code: 'NOTICE_STOCK_NOT_FOUND',
    message: '공지의 대상 상품을 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  INVALID_STATUS: {
    code: 'NOTICE_INVALID_STATUS',
    message: '임시 저장 공지는 삭제하거나 게시할 수 있습니다.',
    status: HttpStatus.CONFLICT,
  },
  PUBLISH_PERIOD_ENDED: {
    code: 'NOTICE_PUBLISH_PERIOD_ENDED',
    message: '게시 종료 일시를 현재 이후로 변경한 뒤 게시해 주세요.',
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
