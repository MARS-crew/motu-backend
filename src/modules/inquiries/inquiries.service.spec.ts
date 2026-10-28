import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { UsersService } from '../users/users.service.js';
import { InquiriesService } from './inquiries.service.js';
import { inquiryTokenSecret } from './inquiries.constants.js';

describe('InquiriesService', () => {
  const findByLoginId = vi.fn();
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
    { findByLoginId } as unknown as UsersService,
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
    query.mockResolvedValue([{ userStatus: 'LOCKED' }]);
    create.mockResolvedValue({ id: 1, ...dto });
    transaction.mockImplementation((callback) =>
      callback({ $queryRaw: query, inquiry: { create } }),
    );
    findByLoginId.mockResolvedValue({ id: 1, password, userStatus: 'LOCKED' });
  });

  it.each(['LOCKED', 'BLOCKED'])(
    '%s 계정은 비밀번호 확인 후 문의 전용 토큰만 받는다',
    async (userStatus) => {
      findByLoginId.mockResolvedValue({ id: 1, password, userStatus });
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
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('틀린 비밀번호와 없는 아이디는 같은 오류다', async () => {
    await expect(
      service.createAccessToken({ loginId: 'limited', password: 'wrong' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_INVALID_CREDENTIALS' },
    });
    findByLoginId.mockResolvedValue(null);
    await expect(
      service.createAccessToken({ loginId: 'missing', password: 'wrong' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_INVALID_CREDENTIALS' },
    });
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('정상 계정은 제한 문의 토큰을 발급하지 않는다', async () => {
    findByLoginId.mockResolvedValue({ id: 1, password, userStatus: 'ACTIVE' });
    await expect(
      service.createAccessToken({ loginId: 'active', password: 'Inquiry1!' }),
    ).rejects.toMatchObject({
      response: { code: 'INQUIRY_ACCOUNT_NOT_RESTRICTED' },
    });
    expect(signAsync).not.toHaveBeenCalled();
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
