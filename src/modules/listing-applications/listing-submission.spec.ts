import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { SectorsService } from '../sectors/sectors.service.js';
import { SubmitListingReqDto } from './dto/req/submit-listing-req.dto.js';
import {
  ListingApplicationNumbersService,
  listingNumberDate,
} from './listing-application-numbers.service.js';

describe('제출 트랜잭션의 카테고리 조회', () => {
  it('검증 중 별도 연결을 빌리지 않고 같은 트랜잭션을 사용한다', async () => {
    const rootRead = vi.fn();
    const txRead = vi.fn().mockResolvedValue([{ code: 1, name: '소프트웨어' }]);
    const service = new SectorsService({
      sector: { findMany: rootRead },
    } as unknown as PrismaService);
    await expect(
      service.getSectors({
        sector: { findMany: txRead },
      } as unknown as Prisma.TransactionClient),
    ).resolves.toEqual({
      items: [{ sectorCode: 1, sectorName: '소프트웨어' }],
    });
    expect(rootRead).not.toHaveBeenCalled();
  });
});

describe('최종 제출 요청', () => {
  it.each([
    undefined,
    null,
    '',
    '2026-11-22',
    '2026-11-22T10:00:00',
    'not-a-date',
  ])('확인한 저장 시각에 시간대가 필요하다: %s', (expectedLastSavedAt) => {
    expect(
      validateSync(
        plainToInstance(SubmitListingReqDto, { expectedLastSavedAt }),
      ),
    ).not.toHaveLength(0);
  });
  it.each(['2026-11-22T10:00:00.123Z', '2026-11-22T19:00:00.123+09:00'])(
    '시간대 포함 시각 허용: %s',
    (expectedLastSavedAt) => {
      expect(
        validateSync(
          plainToInstance(SubmitListingReqDto, { expectedLastSavedAt }),
        ),
      ).toHaveLength(0);
    },
  );
  it.each([
    'userId',
    'status',
    'applicationNumber',
    'submittedAt',
    'code',
    'data',
  ])('서버 결정값과 인증번호를 요청에 넣을 수 없다: %s', (field) => {
    expect(
      validateSync(
        plainToInstance(SubmitListingReqDto, {
          expectedLastSavedAt: '2026-11-22T10:00:00Z',
          [field]: 'injected',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).not.toHaveLength(0);
  });
});

describe('신청번호 발급', () => {
  const numbers = new ListingApplicationNumbersService();
  afterEach(() => vi.useRealTimers());
  it('seed의 과거 접수일도 같은 발급기로 번호를 생성한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T00:00:00Z'));
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ next: 8 }]),
    };
    await expect(
      numbers.next(
        tx as unknown as Prisma.TransactionClient,
        new Date('2026-11-19T15:00:00Z'),
      ),
    ).resolves.toBe('LST-261120-008');
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it('UTC 날짜가 아닌 한국 날짜를 사용한다', () => {
    expect(listingNumberDate(new Date('2026-11-22T14:59:59.999Z'))).toBe(
      '261122',
    );
    expect(listingNumberDate(new Date('2026-11-22T15:00:00.000Z'))).toBe(
      '261123',
    );
    expect(listingNumberDate(new Date('2026-12-31T15:00:00.000Z'))).toBe(
      '270101',
    );
  });
  it.each([
    [1, '001'],
    [43, '043'],
    [999, '999'],
  ])('기존 최대 번호 다음 %s을 3자리로 발급한다', async (next, suffix) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T00:00:00Z'));
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ next }]),
    };
    await expect(
      numbers.next(tx as unknown as Prisma.TransactionClient),
    ).resolves.toBe('LST-261122-' + suffix);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.$queryRaw.mock.invocationCallOrder[0],
    );
  });
  it.each([0, 1000])(
    '고정 3자리 범위 밖 %s이면 접수하지 않는다',
    async (next) => {
      const tx = {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn().mockResolvedValue([{ next }]),
      };
      await expect(
        numbers.next(tx as unknown as Prisma.TransactionClient),
      ).rejects.toMatchObject({
        response: { code: 'LISTING_SUBMISSION_NUMBER_LIMIT' },
      });
    },
  );
  it('잠금 대기 중 한국 날짜가 바뀌면 새 날짜 잠금과 순번을 사용한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-22T14:59:59.999Z'));
    const tx = {
      $executeRaw: vi.fn().mockImplementationOnce(async () => {
        vi.setSystemTime(new Date('2026-11-22T15:00:00Z'));
      }),
      $queryRaw: vi.fn().mockResolvedValue([{ next: 1 }]),
    };
    await expect(
      numbers.next(tx as unknown as Prisma.TransactionClient),
    ).resolves.toBe('LST-261123-001');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
