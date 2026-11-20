import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const AdminAccountErrors = {
  NOT_FOUND: {
    code: 'ADMIN_ACCOUNT_NOT_FOUND',
    message: '존재하지 않는 관리자 계정입니다.',
    status: HttpStatus.NOT_FOUND,
  },
  STATUS_UNCHANGED: {
    code: 'ADMIN_ACCOUNT_STATUS_UNCHANGED',
    message: '변경하려는 상태와 현재 상태가 같습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  /** ADM-ACC-02-E01 */
  SELF_BLOCK: {
    code: 'ADMIN_ACCOUNT_SELF_BLOCK',
    message: '본인 계정은 정지할 수 없습니다.',
    status: HttpStatus.CONFLICT,
  },
  /** ADM-ACC-02-E02 */
  LAST_ACTIVE_ADMIN: {
    code: 'ADMIN_ACCOUNT_LAST_ACTIVE',
    message: '정상 관리자 계정은 최소 1개 이상 남아야 합니다.',
    status: HttpStatus.CONFLICT,
  },
  PASSWORD_CHANGE_REQUIRED: {
    code: 'ADMIN_PASSWORD_CHANGE_REQUIRED',
    message: '임시 비밀번호를 변경한 뒤 이용해 주세요.',
    status: HttpStatus.FORBIDDEN,
  },
  INVALID_CURRENT_PASSWORD: {
    code: 'ADMIN_INVALID_CURRENT_PASSWORD',
    message: '현재 비밀번호가 올바르지 않습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  SAME_PASSWORD: {
    code: 'ADMIN_SAME_PASSWORD',
    message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
} as const satisfies Record<string, ErrorDefinition>;
