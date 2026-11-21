/** 관리자 표시 이름을 정하는 데 필요한 값 */
export interface AdminNameSource {
  loginId: string;
  nickname: string | null;
  adminProfile?: { name: string } | null;
}

/**
 * 관리자를 화면에 표시할 이름. 관리자명 → 닉네임 → 아이디 순으로 쓴다.
 * 관리자 계정 생성 API로 만든 관리자는 닉네임이 없고, seed 관리자는 관리자명이 없다.
 */
export function adminDisplayName(admin: AdminNameSource): string {
  return admin.adminProfile?.name ?? admin.nickname ?? admin.loginId;
}
