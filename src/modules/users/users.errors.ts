import { HttpStatus } from '@nestjs/common';
import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const UserErrors = {
  LOGIN_ID_DUPLICATED: {
    code: 'LOGIN_ID_DUPLICATED',
    message: '이미 사용 중인 아이디입니다.',
    status: HttpStatus.CONFLICT,
  },
  NICKNAME_DUPLICATED: {
    code: 'NICKNAME_DUPLICATED',
    message: '이미 사용 중인 닉네임입니다.',
    status: HttpStatus.CONFLICT,
  },
  EMAIL_DUPLICATED: {
    code: 'EMAIL_DUPLICATED',
    message: '이미 가입된 이메일입니다.',
    status: HttpStatus.CONFLICT,
  },
  /** 회원정보 수정 인증에서 입력한 이메일이 가입 이메일과 다름 */
  EMAIL_MISMATCH: {
    code: 'USER_EMAIL_MISMATCH',
    message: '가입한 이메일과 일치하지 않습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  SAME_PASSWORD: {
    code: 'USER_SAME_PASSWORD',
    message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  /** 회원정보 수정 요청에 바꿀 항목이 없음 */
  NOTHING_TO_UPDATE: {
    code: 'USER_NOTHING_TO_UPDATE',
    message: '수정할 정보를 입력해 주세요.',
    status: HttpStatus.BAD_REQUEST,
  },
  NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    message: '존재하지 않는 사용자입니다.',
    status: HttpStatus.NOT_FOUND,
  },
  STATUS_UNCHANGED: {
    code: 'USER_STATUS_UNCHANGED',
    message: '변경하려는 상태와 현재 상태가 같습니다.',
    status: HttpStatus.BAD_REQUEST,
  },
  NOT_LOCKED: {
    code: 'USER_NOT_LOCKED',
    message: '잠금 상태인 계정만 잠금을 해제할 수 있습니다.',
    status: HttpStatus.CONFLICT,
  },
  /** 처리하는 사이 다른 관리자가 상태를 바꾼 경우 */
  STATUS_CONFLICT: {
    code: 'USER_STATUS_CONFLICT',
    message: '회원 상태가 바뀌었습니다. 다시 확인해 주세요.',
    status: HttpStatus.CONFLICT,
  },
  CONTACT_TWO_FACTOR_REQUIRED: {
    code: 'USER_CONTACT_TWO_FACTOR_REQUIRED',
    message: '2차 보안 설정 후 이용해 주세요.',
    status: HttpStatus.FORBIDDEN,
  },
  SAME_PHONE_NUMBER: {
    code: 'USER_SAME_PHONE_NUMBER',
    message: '현재 연락처와 같은 번호입니다.',
    status: HttpStatus.CONFLICT,
  },
  /** 동시 가입으로 UNIQUE 제약에 걸렸지만 어떤 값이 중복인지 알 수 없는 경우 */
  DUPLICATED: {
    code: 'USER_DUPLICATED',
    message: '이미 가입된 정보입니다.',
    status: HttpStatus.CONFLICT,
  },
  WITHDRAWN_STATUS_IMMUTABLE: {
    code: 'USER_WITHDRAWN_STATUS_IMMUTABLE',
    message: '탈퇴한 회원의 상태는 변경할 수 없습니다.',
    status: HttpStatus.CONFLICT,
  },
  WITHDRAWAL_PENDING_LISTING: {
    code: 'USER_WITHDRAWAL_PENDING_LISTING',
    message:
      '승인된 상품이 거래 시작을 기다리고 있어 탈퇴할 수 없습니다. 고객센터에 문의해 주세요.',
    status: HttpStatus.CONFLICT,
  },
} as const satisfies Record<string, ErrorDefinition>;
