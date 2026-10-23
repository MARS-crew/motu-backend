import { HttpStatus } from '@nestjs/common';
import type { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const FileErrors = {
  NOT_FOUND: {
    code: 'FILE_NOT_FOUND',
    message: '첨부 자료를 찾을 수 없습니다.',
    status: HttpStatus.NOT_FOUND,
  },
  FORMAT: {
    code: 'FILE_INVALID_FORMAT',
    message: 'JPG, JPEG, PNG 이미지 또는 PDF 파일을 선택해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  SIZE: {
    code: 'FILE_TOO_LARGE',
    message: '이미지는 10MB, PDF는 20MB 이하로 등록해 주세요.',
    status: HttpStatus.PAYLOAD_TOO_LARGE,
  },
  COUNT: {
    code: 'FILE_LIMIT_EXCEEDED',
    message: '파일과 링크는 합산 최대 10개까지 등록할 수 있습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  URL: {
    code: 'FILE_INVALID_URL',
    message: 'https://로 시작하는 올바른 주소를 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  INCOMPLETE: {
    code: 'FILE_NOT_COMPLETED',
    message: '이 작성 건에 업로드가 완료된 자료만 저장할 수 있습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  STORAGE: {
    code: 'FILE_STORAGE_UNAVAILABLE',
    message: '파일 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
} as const satisfies Record<string, ErrorDefinition>;
