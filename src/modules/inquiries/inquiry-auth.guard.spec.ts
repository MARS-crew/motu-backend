import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { InquiryAuthGuard } from './inquiry-auth.guard.js';
import {
  INQUIRY_TOKEN_AUDIENCE,
  INQUIRY_TOKEN_ISSUER,
  inquiryTokenSecret,
} from './inquiries.constants.js';

describe('InquiryAuthGuard 토큰 격리', () => {
  const secret = 'inquiry-unit-test-secret-at-least-32-characters';
  const jwt = new JwtService({ secret });
  const findById = vi.fn();
  const guard = new InquiryAuthGuard(
    jwt,
    { get: () => secret } as unknown as ConfigService<never, true>,
    { findById } as unknown as UsersService,
  );
  const requestFor = (token?: string) => ({
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const contextFor = (request: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;
  const limited = (
    payload: object = { sub: 1, purpose: 'INQUIRY' },
    options: object = {},
  ) =>
    jwt.signAsync(payload, {
      secret: inquiryTokenSecret(secret),
      issuer: INQUIRY_TOKEN_ISSUER,
      audience: INQUIRY_TOKEN_AUDIENCE,
      expiresIn: 900,
      ...options,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    findById.mockResolvedValue({ id: 1, role: 'USER', userStatus: 'LOCKED' });
  });

  it.each(['LOCKED', 'BLOCKED', 'ACTIVE'])(
    '문의 전용 토큰은 %s 회원의 본인 문의에만 사용한다',
    async (userStatus) => {
      findById.mockResolvedValue({ id: 1, role: 'USER', userStatus });
      const request = requestFor(await limited());
      expect(await guard.canActivate(contextFor(request))).toBe(true);
      expect(request).toHaveProperty('user', { userId: 1, role: 'USER' });
    },
  );

  it('문의 토큰은 일반 Access 토큰 키로 검증할 수 없다', async () => {
    await expect(jwt.verifyAsync(await limited())).rejects.toThrow();
  });

  it('토큰이 없으면 차단한다', async () => {
    await expect(
      guard.canActivate(contextFor(requestFor())),
    ).rejects.toMatchObject({ response: { code: 'INQUIRY_UNAUTHORIZED' } });
    expect(findById).not.toHaveBeenCalled();
  });

  it.each([
    { sub: '1', purpose: 'INQUIRY' },
    { sub: -1, purpose: 'INQUIRY' },
    { sub: 1.5, purpose: 'INQUIRY' },
    { sub: 2147483648, purpose: 'INQUIRY' },
    { sub: 1, purpose: 'OTHER' },
    { sub: 1 },
  ])('잘못된 subject/purpose는 차단한다: %j', async (payload) => {
    await expect(
      guard.canActivate(contextFor(requestFor(await limited(payload)))),
    ).rejects.toMatchObject({ response: { code: 'INQUIRY_UNAUTHORIZED' } });
    expect(findById).not.toHaveBeenCalled();
  });

  it.each([{ audience: 'orders' }, { issuer: 'other' }])(
    '문의 토큰의 수신자/발급자가 달라도 차단한다',
    async (options) => {
      await expect(
        guard.canActivate(
          contextFor(requestFor(await limited(undefined, options))),
        ),
      ).rejects.toMatchObject({ response: { code: 'INQUIRY_UNAUTHORIZED' } });
    },
  );

  it('만료된 문의 토큰은 별도 만료 코드로 거절한다', async () => {
    await expect(
      guard.canActivate(
        contextFor(requestFor(await limited(undefined, { expiresIn: -1 }))),
      ),
    ).rejects.toMatchObject({ response: { code: 'INQUIRY_TOKEN_EXPIRED' } });
  });

  it('정상 계정은 일반 로그인 토큰으로 이력을 조회한다', async () => {
    findById.mockResolvedValue({ id: 1, role: 'USER', userStatus: 'ACTIVE' });
    expect(
      await guard.canActivate(
        contextFor(requestFor(await jwt.signAsync({ sub: 1, role: 'USER' }))),
      ),
    ).toBe(true);
  });

  it.each(['LOCKED', 'BLOCKED'])(
    '기존 일반 토큰을 가진 %s 계정은 문의 전용 본인 확인을 해야 한다',
    async (userStatus) => {
      findById.mockResolvedValue({ id: 1, role: 'USER', userStatus });
      await expect(
        guard.canActivate(
          contextFor(requestFor(await jwt.signAsync({ sub: 1, role: 'USER' }))),
        ),
      ).rejects.toMatchObject({ response: { code: 'INQUIRY_UNAUTHORIZED' } });
    },
  );

  it('삭제된 사용자의 토큰은 거절한다', async () => {
    findById.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextFor(requestFor(await limited()))),
    ).rejects.toMatchObject({ response: { code: 'INQUIRY_UNAUTHORIZED' } });
  });
});
