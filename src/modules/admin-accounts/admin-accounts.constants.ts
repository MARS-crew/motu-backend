import { UserStatus } from '../../generated/prisma/client.js';

/** 관리자명 최대 길이 */
export const ADMIN_NAME_MAX_LENGTH = 20;
/** 담당 업무 최대 길이 */
export const ADMIN_DUTY_MAX_LENGTH = 50;

/**
 * users의 필수 컬럼 중 관리자에게는 의미 없는 값. 관리자 화면에서는 쓰지 않는다.
 * 닉네임은 중복될 수 없어 접두어 뒤에 무작위 문자를 붙인다. (users.nickname 10자)
 */
export const ADMIN_NICKNAME_PREFIX = 'admin';
export const ADMIN_NICKNAME_RANDOM_LENGTH = 5;
/** 생성한 닉네임이 겹치면 다시 만드는 횟수 */
export const ADMIN_NICKNAME_MAX_ATTEMPTS = 3;
export const ADMIN_BIRTH_DATE = new Date('1900-01-01');

/** 임시 비밀번호 길이. 회원 비밀번호 규칙(8~20자, 영문·숫자·특수문자)을 따른다. */
export const TEMPORARY_PASSWORD_LENGTH = 12;

/** 관리자 상태 변경에서 고를 수 있는 상태 */
export const ADMIN_CHANGEABLE_STATUSES = [
  UserStatus.ACTIVE,
  UserStatus.BLOCKED,
] as const;
export type AdminChangeableStatus = (typeof ADMIN_CHANGEABLE_STATUSES)[number];

export const ADMIN_STATUS_LABELS: Record<UserStatus, string> = {
  [UserStatus.ACTIVE]: '정상',
  [UserStatus.LOCKED]: '잠금',
  [UserStatus.BLOCKED]: '정지',
};

/** 메일 발송을 트랜잭션 안에서 기다리므로 메일 요청 제한 시간(10초)보다 길게 둔다. */
export const ADMIN_CREATE_TX_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000,
} as const;
