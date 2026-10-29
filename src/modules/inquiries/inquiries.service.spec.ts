import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';

vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('argon2')>();
  return { ...actual, verify: vi.fn(actual.verify) };
});
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { InquiriesService } from './inquiries.service.js';
import { inquiryTokenSecret } from './inquiries.constants.js';

describe('InquiriesService', () => {
  const findAttempt = vi.fn();
  const upsertAttempt = vi.fn();
  const deleteAttempts = vi.fn();
  const signAsync = vi.fn();
  const query = vi.fn();
  const create = vi.fn();
  const findFirst = vi.fn();
  const transaction = vi.fn();
  const secret = 'inquiry-service-unit-test-secret-with-32-characters';
  const service = new InquiriesService(
    {
      $transaction: transaction,
      inquiry: { findFirst },
    } as unknown as PrismaService,
    { signAsync } as unknown as JwtService,
    { get: () => secret } as unknown as ConfigService<never, true>,
  );
  const dto = {
    title: '계정 제한 문의',
    content: '계정 제한 해제 방법을 알려주세요.',
  };
  let password: string;
  beforeAll(async () => {
    password = await hash('Inquiry1!');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    signAsync.mockResolvedValue('limited-token');
    query.mockResolvedValue([{ id: 1, password, userStatus: 'LOCKED' }]);
    findAttempt.mockResolvedValue(null);
    upsertAttempt.mockResolvedValue({});
    deleteAttempts.mockResolvedValue({ count: 0 });
    create.mockResolvedValue({ id: 1, ...dto });
    transaction.mockImplementation((callback) =>
      callback({
        $queryRaw: query,
        inquiry: { create },
        inquiryAccessAttempt: {
          findUnique: findAttempt,
          upsert: upsertAttempt,
          deleteMany: deleteAttempts,
        },
      }),
    );
  });

  it.each(['LOCKED', 'BLOCKED'])(
    '%s 계정은 비밀번호 확인 후 문의 전용 토큰만 받는다',
    async (userStatus) => {
      query.mockResolvedValue([{ id: 1, password, userStatus }]);
      expect(
        await service.createAccessToken({
          loginId: 'limited',
          password: 'Inquiry1!',
        }),
      ).toEqual({ inquiryAccessToken: 'limited-token', expiresIn: 900 });
      expect(signAsync).toHaveBeenCalledWith(
        { sub: 1, purpose: 'INQUIRY' },
        expect.objectContaining({
          secret: inquiryTokenSecret(secret),
          audience: 'inquiries',
          issuer: 'motu-inquiries',
          expiresIn: 900,
        }),
      );
      expect(deleteAttempts).toHaveBeenCalledWith({ where: { userId: 1 } });
    },
  );

  it('틀린 비밀번호와 없는 아이디는 같은 오류다', async () => {
    await expect(
      service.createAccessToken({ loginId: 'limited', password: 'wrong' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_INVALID_CREDENTIALS' },
    });
    query.mockResolvedValue([]);
    await expect(
      service.createAccessToken({ loginId: 'missing', password: 'wrong' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_INVALID_CREDENTIALS' },
    });
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('정상 계정은 제한 문의 토큰을 발급하지 않는다', async () => {
    // SQL에서 ACTIVE 계정은 반환하지 않으므로 비밀번호 검사 자체를 수행하지 않는다.
    query.mockResolvedValue([]);
    await expect(
      service.createAccessToken({ loginId: 'active', password: 'Inquiry1!' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_INVALID_CREDENTIALS' },
    });
    expect(verify).not.toHaveBeenCalled();
    expect(upsertAttempt).not.toHaveBeenCalled();
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('다섯 번째 실패 기록은 커밋한 뒤 차단 오류를 반환한다', async () => {
    findAttempt.mockResolvedValue({ failCount: 4, blockedUntil: null });
    await expect(
      service.createAccessToken({ loginId: 'limited', password: 'wrong' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_ACCESS_TEMPORARILY_BLOCKED' },
    });
    expect(upsertAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { failCount: 5, blockedUntil: expect.any(Date) },
      }),
    );
    // 트랜잭션 콜백은 예외가 아닌 결과로 끝나야 실패 횟수가 실제 저장된다.
    await expect(transaction.mock.results[0].value).resolves.toHaveProperty(
      'error',
    );
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('차단 중에는 올바른 비밀번호도 검사하지 않고 차단 시각을 연장하지 않는다', async () => {
    findAttempt.mockResolvedValue({
      failCount: 5,
      blockedUntil: new Date(Date.now() + 60000),
    });
    await expect(
      service.createAccessToken({ loginId: 'limited', password: 'Inquiry1!' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_ACCESS_TEMPORARILY_BLOCKED' },
    });
    expect(verify).not.toHaveBeenCalled();
    expect(upsertAttempt).not.toHaveBeenCalled();
    expect(deleteAttempts).not.toHaveBeenCalled();
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('차단이 만료된 뒤 실패하면 1회부터 새로 집계한다', async () => {
    findAttempt.mockResolvedValue({
      failCount: 5,
      blockedUntil: new Date(Date.now() - 1),
    });
    await expect(
      service.createAccessToken({ loginId: 'limited', password: 'wrong' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_INVALID_CREDENTIALS' },
    });
    expect(upsertAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { failCount: 1, blockedUntil: null },
      }),
    );
  });

  it('차단 만료 뒤 성공하면 문의 실패 기록만 지운다', async () => {
    findAttempt.mockResolvedValue({
      failCount: 5,
      blockedUntil: new Date(Date.now() - 1),
    });
    await expect(
      service.createAccessToken({ loginId: 'limited', password: 'Inquiry1!' }),
    ).resolves.toHaveProperty('inquiryAccessToken');
    expect(deleteAttempts).toHaveBeenCalledWith({ where: { userId: 1 } });
  });

  it('실패 기록 저장 실패 시 토큰을 발급하지 않는다', async () => {
    upsertAttempt.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      service.createAccessToken({ loginId: 'limited', password: 'wrong' }),
    ).rejects.toThrow('database unavailable');
    expect(signAsync).not.toHaveBeenCalled();
  });

  it.each([
    [{ title: '가'.repeat(101), content: '본문' }, 'INQUIRY_INVALID_TITLE'],
    [{ title: '  ', content: '본문' }, 'INQUIRY_INVALID_TITLE'],
    [{ title: 1, content: '본문' }, 'INQUIRY_INVALID_TITLE'],
    [{ title: '제목', content: '가'.repeat(5001) }, 'INQUIRY_INVALID_CONTENT'],
    [{ title: '제목', content: ' \n ' }, 'INQUIRY_INVALID_CONTENT'],
    [{ title: '제목', content: null }, 'INQUIRY_INVALID_CONTENT'],
  ])(
    'DTO 없는 서비스 직접 호출도 잘못된 입력을 거절한다',
    async (input, code) => {
      await expect(
        service.create(1, input as unknown as typeof dto),
      ).rejects.toMatchObject({ response: { code } });
      expect(transaction).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('서비스도 앞뒤 공백을 제거하고 이모지 경계와 줄바꿈을 보존한다', async () => {
    await service.create(1, {
      title: '  ' + '😀'.repeat(100) + '  ',
      content: '  ' + '😀'.repeat(4999) + '\n  ',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: '😀'.repeat(100),
          content: '😀'.repeat(4999),
        }),
      }),
    );
    await service.create(1, { title: '제목', content: '  첫 줄\n둘째 줄  ' });
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: '첫 줄\n둘째 줄' }),
      }),
    );
  });

  it.each([
    ['LOCKED', 'LOGIN_FAILED_LOCKED'],
    ['BLOCKED', 'SUSPENDED'],
  ])(
    '접수 시 %s 상태에서 문의 유형 %s를 정한다',
    async (userStatus, inquiryType) => {
      query.mockResolvedValue([{ userStatus }]);
      await service.create(1, dto);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 1,
            inquiryType,
            inquiryCode: expect.stringMatching(/^INQ-\d{8}-[A-F0-9]{12}$/),
          }),
        }),
      );
    },
  );

  it('접수 시 계정이 이미 해제됐으면 저장하지 않는다', async () => {
    query.mockResolvedValue([{ userStatus: 'ACTIVE' }]);
    await expect(service.create(1, dto)).rejects.toMatchObject({
      response: { code: 'INQUIRY_ACCOUNT_NOT_RESTRICTED' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('문의번호 충돌은 새 트랜잭션에서 재시도한다', async () => {
    create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await service.create(1, dto);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('DB 실패는 숨기거나 성공으로 반환하지 않는다', async () => {
    create.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.create(1, dto)).rejects.toThrow(
      'database unavailable',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 2147483648, Number.NaN])(
    '상세 조회의 범위 밖 ID %s는 DB에 보내지 않는다',
    async (id) => {
      await expect(service.detail(1, id)).rejects.toMatchObject({
        response: { code: 'INQUIRY_NOT_FOUND' },
      });
      expect(findFirst).not.toHaveBeenCalled();
    },
  );

  it('타인 문의와 없는 문의는 모두 같은 404다', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.detail(1, 7)).rejects.toMatchObject({
      response: { code: 'INQUIRY_NOT_FOUND' },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7, userId: 1 } }),
    );
  });
});
