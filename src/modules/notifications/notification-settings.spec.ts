import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { UpdateNotificationSettingsReqDto } from './dto/req/update-notification-settings-req.dto.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { evaluatePushDelivery } from './push-delivery.policy.js';

describe('알림 수신 설정 DTO', () => {
  it.each([false, true])('실제 boolean 허용: %s', (value) => {
    expect(
      validateSync(
        plainToInstance(UpdateNotificationSettingsReqDto, {
          isPushEnabled: value,
          nightPushEnabled: value,
        }),
      ),
    ).toHaveLength(0);
  });
  it.each(['false', 'true', 0, 1, null, [], {}])(
    '문자열·숫자·null 등 거절: %j',
    (value) => {
      for (const field of ['isPushEnabled', 'nightPushEnabled']) {
        expect(
          validateSync(
            plainToInstance(UpdateNotificationSettingsReqDto, {
              [field]: value,
            }),
          ),
        ).not.toHaveLength(0);
      }
    },
  );
  it.each(['userId', 'id', 'email', 'role', 'timeZone', 'canChangeNightPush'])(
    '소유자·서버 필드 주입 거절: %s',
    (field) => {
      expect(
        validateSync(
          plainToInstance(UpdateNotificationSettingsReqDto, {
            isPushEnabled: true,
            [field]: 1,
          }),
          { whitelist: true, forbidNonWhitelisted: true },
        ),
      ).not.toHaveLength(0);
    },
  );
});

describe('한국 시간 푸시 발송 판단', () => {
  it.each([
    ['2026-11-25T11:59:59.999Z', true],
    ['2026-11-25T12:00:00.000Z', false],
    ['2026-11-25T14:59:59.999Z', false],
    ['2026-11-25T15:00:00.000Z', false],
    ['2026-11-25T22:59:59.999Z', false],
    ['2026-11-25T23:00:00.000Z', true],
    ['2026-12-31T15:00:00.000Z', false],
    ['2026-11-26T08:00:00+09:00', true],
    ['2026-11-25T21:00:00+09:00', false],
  ])('21시 포함·08시 미포함: %s', (time, allowed) => {
    expect(
      evaluatePushDelivery(
        { isPushEnabled: true, nightPushEnabled: false },
        new Date(time),
      ).allowed,
    ).toBe(allowed);
  });
  it.each([false, true])(
    '전체 OFF이면 야간 동의 %s와 무관하게 발송 차단',
    (nightPushEnabled) => {
      for (const time of ['2026-11-25T01:00:00Z', '2026-11-25T15:00:00Z']) {
        expect(
          evaluatePushDelivery(
            { isPushEnabled: false, nightPushEnabled },
            new Date(time),
          ),
        ).toEqual({ allowed: false, reason: 'PUSH_DISABLED' });
      }
    },
  );
  it('야간 동의가 켜져 있으면 야간 허용', () => {
    expect(
      evaluatePushDelivery(
        { isPushEnabled: true, nightPushEnabled: true },
        new Date('2026-11-25T15:00:00Z'),
      ),
    ).toEqual({ allowed: true, reason: 'ALLOWED' });
  });
  it('잘못된 시각으로 발송하지 않음', () => {
    expect(
      evaluatePushDelivery(
        { isPushEnabled: true, nightPushEnabled: true },
        new Date('bad'),
      ),
    ).toEqual({ allowed: false, reason: 'INVALID_TIME' });
  });
});

describe('NotificationSettingsService', () => {
  let state: {
    isPushEnabled: boolean;
    nightPushEnabled: boolean;
    userStatus: string;
    isDeleted: boolean;
  };
  const user = { findUnique: vi.fn(), update: vi.fn() };
  const tx = { $queryRaw: vi.fn(), user };
  const prisma = {
    user,
    $transaction: vi.fn((fn: (value: unknown) => unknown) => fn(tx)),
  };
  const service = new NotificationSettingsService(
    prisma as unknown as PrismaService,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    state = {
      isPushEnabled: true,
      nightPushEnabled: true,
      userStatus: 'ACTIVE',
      isDeleted: false,
    };
    user.findUnique.mockImplementation(async () => ({ ...state }));
    user.update.mockImplementation(async ({ data }) =>
      Object.assign(state, data),
    );
  });
  it('조회는 저장 값을 보존하며 변경 가능 여부를 반환', async () => {
    state.isPushEnabled = false;
    expect(await service.get(1)).toMatchObject({
      isPushEnabled: false,
      nightPushEnabled: true,
      canChangeNightPush: false,
      timeZone: 'Asia/Seoul',
      nightStart: '21:00',
      nightEnd: '08:00',
    });
    expect(user.update).not.toHaveBeenCalled();
  });
  it('전체 OFF·ON을 반복해도 기존 야간 동의 보존', async () => {
    expect(await service.update(1, { isPushEnabled: false })).toMatchObject({
      nightPushEnabled: true,
      canChangeNightPush: false,
    });
    expect(await service.update(1, { isPushEnabled: true })).toMatchObject({
      nightPushEnabled: true,
      canChangeNightPush: true,
    });
  });
  it('야간만 변경하면 전체 수신 설정 유지', async () => {
    expect(await service.update(1, { nightPushEnabled: false })).toMatchObject({
      isPushEnabled: true,
      nightPushEnabled: false,
    });
  });
  it('OFF에서 전체 ON과 야간 변경을 같은 요청으로 허용', async () => {
    state.isPushEnabled = false;
    expect(
      await service.update(1, { isPushEnabled: true, nightPushEnabled: false }),
    ).toMatchObject({ isPushEnabled: true, nightPushEnabled: false });
  });
  it.each([false, true])(
    '전체 OFF에서 야간 값 %s 전달 거절',
    async (nightPushEnabled) => {
      state.isPushEnabled = false;
      await expect(
        service.update(1, { nightPushEnabled }),
      ).rejects.toMatchObject({
        response: { code: 'NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH' },
      });
      expect(user.update).not.toHaveBeenCalled();
    },
  );
  it('전체 OFF+야간 변경 요청 전체 거절', async () => {
    await expect(
      service.update(1, { isPushEnabled: false, nightPushEnabled: false }),
    ).rejects.toMatchObject({
      response: { code: 'NOTIFICATION_SETTINGS_NIGHT_REQUIRES_PUSH' },
    });
    expect(state.isPushEnabled).toBe(true);
    expect(user.update).not.toHaveBeenCalled();
  });
  it('빈 변경 거절', async () => {
    await expect(service.update(1, {})).rejects.toMatchObject({
      response: { code: 'NOTIFICATION_SETTINGS_NOTHING_TO_UPDATE' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    ['LOCKED', 'AUTH_ACCOUNT_LOCKED'],
    ['BLOCKED', 'AUTH_ACCOUNT_BLOCKED'],
    ['WITHDRAWN', 'AUTH_UNAUTHORIZED'],
  ])('회원 상태 %s 재검증', async (userStatus, code) => {
    state.userStatus = userStatus;
    await expect(
      service.update(1, { isPushEnabled: false }),
    ).rejects.toMatchObject({ response: { code } });
    expect(user.update).not.toHaveBeenCalled();
    expect(await service.getPushDecision(1)).toEqual({
      allowed: false,
      reason: 'USER_UNAVAILABLE',
    });
  });
  it('없는 회원·삭제 회원 발송 차단', async () => {
    user.findUnique.mockResolvedValueOnce(null);
    expect(await service.getPushDecision(1)).toEqual({
      allowed: false,
      reason: 'USER_UNAVAILABLE',
    });
    state.isDeleted = true;
    expect(await service.getPushDecision(1)).toEqual({
      allowed: false,
      reason: 'USER_UNAVAILABLE',
    });
  });
  it('발송 판단에 호출자가 제공한 트랜잭션 사용', async () => {
    const findUnique = vi.fn().mockResolvedValue(state);
    expect(
      await service.getPushDecision(1, new Date(), {
        user: { findUnique },
      } as unknown as Prisma.TransactionClient),
    ).toEqual({ allowed: true, reason: 'ALLOWED' });
    expect(user.findUnique).not.toHaveBeenCalled();
  });
  it('큐에 넣을 때의 결과를 캐시하지 않고 최신 설정 재조회', async () => {
    expect((await service.getPushDecision(1)).allowed).toBe(true);
    state.isPushEnabled = false;
    expect(await service.getPushDecision(1)).toEqual({
      allowed: false,
      reason: 'PUSH_DISABLED',
    });
  });
});
