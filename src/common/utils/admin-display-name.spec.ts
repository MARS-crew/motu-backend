import { adminDisplayName } from './admin-display-name.js';

describe('adminDisplayName', () => {
  it('관리자명이 있으면 관리자명을 쓴다', () => {
    expect(
      adminDisplayName({
        loginId: 'admin01',
        nickname: null,
        adminProfile: { name: '김관리' },
      }),
    ).toBe('김관리');
  });

  it('관리자 정보가 없으면 닉네임을 쓴다', () => {
    expect(
      adminDisplayName({
        loginId: 'motuadmin',
        nickname: '운영자',
        adminProfile: null,
      }),
    ).toBe('운영자');
  });

  it('관리자명과 닉네임이 모두 없으면 아이디를 쓴다', () => {
    expect(adminDisplayName({ loginId: 'admin01', nickname: null })).toBe(
      'admin01',
    );
  });
});
