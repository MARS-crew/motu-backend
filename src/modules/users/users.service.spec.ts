import { verify } from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { VerificationsService } from '../verifications/verifications.service.js';
import { CreateUserReqDto } from './dto/req/create-user-req.dto.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const tx = { user: { create: vi.fn() } };
  const countUsers = vi.fn();
  const createInitialAccount = vi.fn();
  const sendEmailCode = vi.fn();
  const consumeVerified = vi.fn();
  const prisma = {
    user: { count: countUsers },
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const accountsService = {
    createInitialAccount,
  } as unknown as AccountsService;
  const verificationsService = {
    sendEmailCode,
    consumeVerified,
  } as unknown as VerificationsService;
  const service = new UsersService(
    prisma,
    accountsService,
    verificationsService,
  );

  const dto: CreateUserReqDto = {
    loginId: 'motu01',
    password: 'motu1234!',
    nickname: '모투투자',
    email: 'name@example.com',
    birthDate: '2000-01-01',
    termsAgreed: true,
    privacyAgreed: true,
    marketingAgreed: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    countUsers.mockResolvedValue(0);
    tx.user.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 1, userStatus: 'ACTIVE', role: 'USER', ...data }),
    );
    createInitialAccount.mockResolvedValue({
      cash: 3_000_000n,
    } as never);
  });

  it('비밀번호를 해시해 저장하고 계좌를 만든다', async () => {
    const result = await service.create(dto);

    const saved = tx.user.create.mock.calls[0][0].data;
    expect(saved.password).not.toBe(dto.password);
    expect(await verify(saved.password, dto.password)).toBe(true);
    expect(consumeVerified).toHaveBeenCalledWith(
      tx,
      'EMAIL',
      'SIGNUP',
      dto.email,
    );
    expect(createInitialAccount).toHaveBeenCalledWith(tx, 1);
    expect(result).toEqual({
      userId: 1,
      loginId: 'motu01',
      nickname: '모투투자',
      userStatus: 'ACTIVE',
      role: 'USER',
      cash: 3_000_000,
    });
  });

  it('이미 사용 중인 아이디면 가입하지 않는다', async () => {
    countUsers.mockResolvedValueOnce(1);

    await expect(service.create(dto)).rejects.toMatchObject({
      response: { code: 'LOGIN_ID_DUPLICATED' },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('동시 가입으로 UNIQUE 제약에 걸리면 중복 필드를 알려준다', async () => {
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          driverAdapterError: {
            cause: { constraint: { index: 'TB_USER_nickname_key' } },
          },
        },
      }),
    );

    await expect(service.create(dto)).rejects.toMatchObject({
      status: 409,
      response: { code: 'NICKNAME_DUPLICATED' },
    });
  });

  it('이미 가입된 이메일로는 인증번호를 보내지 않는다', async () => {
    countUsers.mockResolvedValue(1);

    await expect(service.sendSignupEmailCode(dto.email)).rejects.toMatchObject({
      response: { code: 'EMAIL_DUPLICATED' },
    });
    expect(sendEmailCode).not.toHaveBeenCalled();
  });
});
