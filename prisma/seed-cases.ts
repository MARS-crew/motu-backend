import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import {
  AdminActivityAction,
  AdminActivityResult,
  AdminActivityTarget,
  AnomalyAction,
  AnomalyStatus,
  AnomalyType,
  InquiryReplyStatus,
  InquirySource,
  InquiryStatus,
  InquiryType,
  ListingApplicationStatus,
  NoticeStatus,
  NoticeType,
  NotificationType,
  PointResetCondition,
  PointResetResult,
  Prisma,
  PrismaClient,
  Role,
  TradeStatus,
  TwoFactorAction,
  TwoFactorStatus,
  UserStatus,
} from '../src/generated/prisma/client.js';
import { inquiryCode } from '../src/modules/inquiries/inquiries.constants.js';

/**
 * 프론트 연동 때 화면 상태별로 확인할 목데이터. production에서는 실행하지 않는다.
 * 기본 seed(계정·상품·신청서·시세)와 대시보드 seed 다음에 실행한다. 케이스마다 이미 있으면 건너뛴다.
 *
 * - 회원: 로그인 실패 3회, 2차 보안 인증 제한, 2차 보안 해제, 2차 보안 이력
 * - 관리자: 관리자명·담당 업무가 있는 정상 관리자, 임시 비밀번호 상태, 정지 관리자
 * - 상장 신청: 승인 정보·상품 연결, 보완 요청 회차, 만료, 탈퇴 신청자의 발행 보류
 * - 계정 문의: 답변 완료, 발송 실패(재발송 가능), 발송 결과 불명확, 기존 본인 확인 문의
 * - 이상 거래: 주문 처리 실패, 잔액 불일치, 회원 정지·상품 거래 중지로 처리완료
 * - 공지: 임시저장, 숨김 / 알림: 체결·목표가·임시저장 만료(읽음·안 읽음) / 지정가 알림 / 포인트 리셋 이력
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const CASE_EMAIL_DOMAIN = 'case.motu.test';

type SeedPrisma = PrismaClient;

export async function seedCases(
  prisma: SeedPrisma,
  userPasswordHash: string,
  adminPasswordHash: string,
): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('케이스별 목데이터는 production에서 만들지 않습니다.');
  }
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, loginId: 'motuadmin' },
    select: { id: true },
  });
  const motuuser = await prisma.user.findUnique({
    where: { loginId: 'motuuser' },
    select: { id: true, account: { select: { id: true, cash: true } } },
  });
  if (!admin || !motuuser) {
    throw new Error(
      'motuadmin·motuuser가 없습니다. 기본 seed를 먼저 실행하세요.',
    );
  }

  await createUserCases(prisma, userPasswordHash);
  await createAdminCases(prisma, adminPasswordHash);
  await createListingCases(prisma, admin.id, motuuser.id);
  await createInquiryCases(prisma, admin.id);
  await createAnomalyCases(prisma, admin.id);
  await createNoticeCases(prisma);
  await createUserActivityCases(prisma, motuuser.id, motuuser.account!);
}

/** 회원 화면 상태. 비밀번호는 motuuser와 같다. */
async function createUserCases(
  prisma: SeedPrisma,
  passwordHash: string,
): Promise<void> {
  const now = Date.now();
  const cases: {
    loginId: string;
    nickname: string;
    data: Partial<Prisma.UserCreateInput>;
    histories?: { action: TwoFactorAction; phone: string; daysAgo: number }[];
  }[] = [
    {
      // 로그인 실패 3회. 다음 실패 때 실패 횟수 4/5가 표시된다.
      loginId: 'motufail3',
      nickname: '실패테스터',
      data: { loginFailCount: 3 },
    },
    {
      // 2차 보안 SMS 인증번호 5회 오입력으로 인증이 제한된 상태 (7일 뒤 해제)
      loginId: 'motusmslock',
      nickname: '인증제한',
      data: {
        twoFactorStatus: TwoFactorStatus.ENABLED,
        twoFactorPhoneNumber: '01000000001',
        twoFactorEnabledDate: new Date(now - 10 * DAY),
        twoFactorFailCount: 0,
        twoFactorLockedUntil: new Date(now + 7 * DAY),
        phoneNumber: '01000000001',
      },
      histories: [
        { action: TwoFactorAction.ENABLED, phone: '01000000001', daysAgo: 10 },
      ],
    },
    {
      // 2차 보안을 설정했다가 해제한 상태 ([2차 보안 설정하기] 표시)
      loginId: 'motu2faoff',
      nickname: '보안해제',
      data: {
        twoFactorStatus: TwoFactorStatus.DISABLED,
        phoneNumber: '01000000002',
      },
      histories: [
        { action: TwoFactorAction.ENABLED, phone: '01000000002', daysAgo: 20 },
        {
          action: TwoFactorAction.PHONE_CHANGED,
          phone: '01000000003',
          daysAgo: 12,
        },
        { action: TwoFactorAction.DISABLED, phone: '01000000003', daysAgo: 3 },
      ],
    },
  ];

  for (const seed of cases) {
    if (await prisma.user.findUnique({ where: { loginId: seed.loginId } })) {
      continue;
    }
    await prisma.user.create({
      data: {
        loginId: seed.loginId,
        password: passwordHash,
        email: `${seed.loginId}@${CASE_EMAIL_DOMAIN}`,
        nickname: seed.nickname,
        birthDate: new Date('2000-01-01'),
        termsAgreed: true,
        privacyAgreed: true,
        marketingAgreed: false,
        ...seed.data,
        account: {
          create: {
            cash: 3_000_000n,
            ledgers: {
              create: {
                type: 'DEPOSIT',
                amount: 3_000_000n,
                balanceAfter: 3_000_000n,
                createDate: new Date(now - 30 * DAY),
              },
            },
          },
        },
        twoFactorHistories: seed.histories && {
          create: seed.histories.map((history) => ({
            action: history.action,
            phoneNumber: history.phone,
            ipAddress: '127.0.0.1',
            createDate: new Date(now - history.daysAgo * DAY),
          })),
        },
      },
    });
    console.log(`케이스: 회원 ${seed.loginId}`);
  }

  // 기존 2차 보안 설정 계정에 이력이 없으면 설정·번호 변경 이력을 남긴다.
  const secure = await prisma.user.findUnique({
    where: { loginId: 'motusecure' },
    select: { id: true, twoFactorHistories: { select: { id: true } } },
  });
  if (secure && secure.twoFactorHistories.length === 0) {
    await prisma.twoFactorHistory.createMany({
      data: [
        {
          userId: secure.id,
          action: TwoFactorAction.ENABLED,
          phoneNumber: '01099999999',
          ipAddress: '127.0.0.1',
          createDate: new Date(now - 14 * DAY),
        },
        {
          userId: secure.id,
          action: TwoFactorAction.PHONE_CHANGED,
          phoneNumber: '01000000000',
          ipAddress: '127.0.0.1',
          createDate: new Date(now - 5 * DAY),
        },
      ],
    });
  }
}

/**
 * 관리자 계정 화면 상태. 관리자 계정 생성 API와 같게 닉네임·생년월일은 비운다.
 * 비밀번호는 motuadmin과 같다. motuadmin03은 임시 비밀번호 상태라 로그인 후 비밀번호를 바꿔야 한다.
 */
async function createAdminCases(
  prisma: SeedPrisma,
  passwordHash: string,
): Promise<void> {
  const now = Date.now();
  const admins = [
    {
      loginId: 'motuadmin02',
      name: '김관리',
      duty: '상장 심사',
      status: UserStatus.ACTIVE,
      passwordChangeRequired: false,
      lastLoginHoursAgo: 3,
    },
    {
      loginId: 'motuadmin03',
      name: '박신규',
      duty: '운영 참고',
      status: UserStatus.ACTIVE,
      passwordChangeRequired: true,
      lastLoginHoursAgo: null,
    },
    {
      loginId: 'motuadmin04',
      name: '이정지',
      duty: null,
      status: UserStatus.BLOCKED,
      passwordChangeRequired: false,
      lastLoginHoursAgo: 120,
    },
  ];

  for (const seed of admins) {
    if (await prisma.user.findUnique({ where: { loginId: seed.loginId } })) {
      continue;
    }
    await prisma.user.create({
      data: {
        loginId: seed.loginId,
        password: passwordHash,
        email: `${seed.loginId}@${CASE_EMAIL_DOMAIN}`,
        role: Role.ADMIN,
        userStatus: seed.status,
        termsAgreed: false,
        privacyAgreed: false,
        marketingAgreed: false,
        lastLoginDate:
          seed.lastLoginHoursAgo === null
            ? null
            : new Date(now - seed.lastLoginHoursAgo * HOUR),
        createDate: new Date(now - 10 * DAY),
        adminProfile: {
          create: {
            name: seed.name,
            duty: seed.duty,
            passwordChangeRequired: seed.passwordChangeRequired,
          },
        },
      },
    });
    console.log(`케이스: 관리자 ${seed.loginId}`);
  }
}

/** 상장 신청 화면 상태 */
async function createListingCases(
  prisma: SeedPrisma,
  adminId: number,
  motuuserId: number,
): Promise<void> {
  const now = Date.now();

  // 보완 요청 신청서에 보완 회차가 없으면 관리자 보완 요청 API와 같은 형태로 만든다.
  const revisionRequested = await prisma.listingApplication.findFirst({
    where: {
      status: ListingApplicationStatus.REVISION_REQUESTED,
      revisions: { none: {} },
    },
  });
  if (revisionRequested) {
    const deadline =
      revisionRequested.revisionDeadline ?? new Date(now + 5 * DAY);
    const requestedAt = new Date(now - 2 * DAY);
    await prisma.listingApplicationRevision.create({
      data: {
        applicationId: revisionRequested.id,
        requestedById: adminId,
        requestItems: ['증빙자료', '서비스 지표'],
        requestContent:
          revisionRequested.reviewComment ??
          '매출 증빙 자료와 MAU 산출 근거를 보완해 주세요.',
        deadline,
        deadlineHistory: [
          {
            deadline: deadline.toISOString(),
            adminId,
            changedAt: requestedAt.toISOString(),
            reason: '최초 지정',
          },
        ],
        previousData: {
          ...(revisionRequested.draftData as Prisma.JsonObject),
          _attachments: {},
        },
        createDate: requestedAt,
      },
    });
    console.log(`케이스: 신청서 ${revisionRequested.id} 보완 요청 회차`);
  }

  // 승인 신청서에 승인 정보·상품 연결이 없으면 거래 대기 상품과 연결한다.
  const approved = await prisma.listingApplication.findFirst({
    where: {
      status: ListingApplicationStatus.APPROVED,
      approvalData: { equals: Prisma.DbNull },
    },
  });
  const pendingStock = await prisma.stock.findFirst({
    where: {
      tradeStatus: TradeStatus.PENDING,
      isDeleted: false,
      listingApplication: null,
      listingBlockedAt: null,
    },
  });
  if (approved && pendingStock) {
    const approvalData = {
      finalPrice: String(pendingStock.basePrice),
      totalIssuedQuantity: String(pendingStock.listedShares),
      listingDate: kstDate(pendingStock.listingDate),
      tradingStartAt: pendingStock.listingDate.toISOString(),
      reason: '기본정보·증빙자료 검토 및 수익 지표를 반영해 상장가 확정',
      priceAdjustmentReason:
        '기본정보·증빙자료 검토 및 수익 지표를 반영해 상장가 확정',
    };
    await prisma.listingApplication.update({
      where: { id: approved.id },
      data: {
        stockId: pendingStock.id,
        approvalData,
        reviewComment: approvalData.reason,
      },
    });
    console.log(
      `케이스: 신청서 ${approved.id} 승인 정보 → 상품 ${pendingStock.stockCode}`,
    );
  }

  // 임시저장 기간이 지나 만료된 신청서
  const hasExpired = await prisma.listingApplication.count({
    where: { userId: motuuserId, status: ListingApplicationStatus.EXPIRED },
  });
  const draft = await prisma.listingApplication.findFirst({
    where: { userId: motuuserId, status: ListingApplicationStatus.DRAFT },
    orderBy: { id: 'asc' },
  });
  if (hasExpired === 0 && draft) {
    const savedAt = new Date(now - 40 * DAY);
    await prisma.listingApplication.create({
      data: {
        userId: motuuserId,
        status: ListingApplicationStatus.EXPIRED,
        serviceName: 'OldNote',
        officialUrl: 'https://oldnote.example.com',
        normalizedOfficialUrl: 'oldnote.example.com',
        currentStep: 2,
        draftData: {
          ...(draft.draftData as Prisma.JsonObject),
          serviceName: 'OldNote',
          officialUrl: 'https://oldnote.example.com',
        },
        lastSavedAt: savedAt,
        expiresAt: new Date(savedAt.getTime() + 30 * DAY),
        createDate: savedAt,
      },
    });
    console.log('케이스: 만료된 임시저장 신청서');
  }

  await createBlockedListing(prisma, adminId, now);
}

/** 승인 뒤 신청자가 탈퇴해 발행이 보류된 거래 대기 상품 (PR #90 발행 보류) */
async function createBlockedListing(
  prisma: SeedPrisma,
  adminId: number,
  now: number,
): Promise<void> {
  if (
    await prisma.stock.count({ where: { listingBlockedAt: { not: null } } })
  ) {
    return;
  }
  const withdrawn = await prisma.user.findFirst({
    where: { userStatus: UserStatus.WITHDRAWN, role: Role.USER },
    orderBy: { id: 'asc' },
  });
  const template = await prisma.listingApplication.findFirst({
    where: { status: ListingApplicationStatus.SUBMITTED },
  });
  if (!withdrawn || !template) {
    console.log(
      '케이스: 탈퇴 회원 또는 접수 신청서가 없어 발행 보류 상품을 건너뜀',
    );
    return;
  }

  const [{ next }] = await prisma.$queryRaw<{ next: bigint }[]>`
    SELECT COALESCE(MAX(SUBSTRING(stock_code FROM 5)::bigint), 0) + 1 AS next
    FROM stocks WHERE stock_code ~ '^MOTU[0-9]{1,16}$'
  `;
  const startsAt = new Date(now - 1 * DAY);
  const stock = await prisma.stock.create({
    data: {
      stockCode: `MOTU${next.toString().padStart(4, '0')}`,
      sectorCode: 1,
      name: 'GhostApp',
      summary: '신청자 탈퇴로 발행이 보류된 테스트 상품',
      description: '승인 뒤 거래 시작 전에 신청자가 탈퇴한 상품입니다.',
      mainImageUrl: 'https://placehold.co/600x400?text=GhostApp',
      officialUrl: 'https://ghostapp.example.com',
      operatorName: '고스트앱',
      listedShares: 500_000n,
      basePrice: 5_000n,
      priceTickSize: 10n,
      minOrderPrice: 10n,
      minOrderQty: 1n,
      approvedListingDate: new Date(kstDate(startsAt)),
      listingDate: startsAt,
      tradeStatus: TradeStatus.PENDING,
      listingBlockedAt: new Date(now - 1 * DAY + 5000),
      listingBlockedReason: '신청자 탈퇴로 발행 보류',
    },
  });
  const reason = '서비스 지표 확인 완료';
  const application = await prisma.listingApplication.create({
    data: {
      userId: withdrawn.id,
      status: ListingApplicationStatus.APPROVED,
      applicationNumber: `MOTU-${kstDate(new Date(now - 6 * DAY)).replaceAll('-', '')}-GHOSTAPP`,
      submittedAt: new Date(now - 6 * DAY),
      reviewComment: reason,
      serviceName: 'GhostApp',
      officialUrl: 'https://ghostapp.example.com',
      normalizedOfficialUrl: 'ghostapp.example.com',
      currentStep: template.currentStep,
      draftData: {
        ...(template.draftData as Prisma.JsonObject),
        serviceName: 'GhostApp',
        officialUrl: 'https://ghostapp.example.com',
      },
      lastSavedAt: new Date(now - 6 * DAY),
      expiresAt: new Date(now + 24 * DAY),
      stockId: stock.id,
      approvalData: {
        finalPrice: '5000',
        totalIssuedQuantity: '500000',
        listingDate: kstDate(startsAt),
        tradingStartAt: startsAt.toISOString(),
        reason,
      },
      createDate: new Date(now - 6 * DAY),
    },
  });
  await prisma.adminActivityLog.create({
    data: {
      adminId,
      targetType: AdminActivityTarget.LISTING_APPLICATION,
      targetId: BigInt(application.id),
      targetLabel: application.applicationNumber,
      action: AdminActivityAction.LISTING_APPROVE,
      summary: '검토 중 → 승인',
      reason,
      beforeValue: { status: ListingApplicationStatus.UNDER_REVIEW },
      afterValue: {
        status: ListingApplicationStatus.APPROVED,
        stockId: stock.id,
        stockCode: stock.stockCode,
      },
      ipAddress: '127.0.0.1',
      createDate: new Date(now - 3 * DAY),
    },
  });
  console.log(
    `케이스: 발행 보류 상품 ${stock.stockCode} (신청서 ${application.id})`,
  );
}

/** 계정 문의 답변 상태 */
async function createInquiryCases(
  prisma: SeedPrisma,
  adminId: number,
): Promise<void> {
  if (
    await prisma.inquiry.count({
      where: { replyEmail: { endsWith: `@${CASE_EMAIL_DOMAIN}` } },
    })
  ) {
    return;
  }
  const now = Date.now();
  const locked = await prisma.user.findUnique({
    where: { loginId: 'motulocked' },
    select: { id: true, email: true },
  });

  const cases: {
    label: string;
    status: InquiryStatus;
    type: InquiryType;
    hoursAgo: number;
    attempt?: {
      status: InquiryReplyStatus;
      deliveryMode: string | null;
      providerMessageId?: string;
      errorCode?: string;
      finalized: boolean;
    };
  }[] = [
    {
      label: '답변 완료',
      status: InquiryStatus.COMPLETED,
      type: InquiryType.LOGIN_FAILED_LOCKED,
      hoursAgo: 72,
      attempt: {
        status: InquiryReplyStatus.ACCEPTED,
        deliveryMode: 'BREVO',
        providerMessageId: '<seed-accepted@smtp-relay.mailin.fr>',
        finalized: true,
      },
    },
    {
      label: '발송 실패 (다시 보낼 수 있음)',
      status: InquiryStatus.IN_PROGRESS,
      type: InquiryType.PHONE_UNAVAILABLE,
      hoursAgo: 26,
      attempt: {
        status: InquiryReplyStatus.FAILED,
        deliveryMode: 'BREVO',
        errorCode: 'MAIL_REJECTED',
        finalized: true,
      },
    },
    {
      label: '발송 결과 불명확 (재발송 사유 필요)',
      status: InquiryStatus.IN_PROGRESS,
      type: InquiryType.SUSPENDED,
      hoursAgo: 10,
      attempt: {
        status: InquiryReplyStatus.UNKNOWN,
        deliveryMode: 'BREVO',
        errorCode: 'MAIL_TIMEOUT',
        finalized: false,
      },
    },
  ];

  for (const [index, seed] of cases.entries()) {
    const createDate = new Date(now - seed.hoursAgo * HOUR);
    const startedAt = new Date(createDate.getTime() + HOUR);
    const replyEmail = `case${index + 1}@${CASE_EMAIL_DOMAIN}`;
    const replyText = `안녕하세요. 문의하신 내용 확인했습니다. (${seed.label} 테스트)`;
    const inquiry = await prisma.inquiry.create({
      data: {
        source: InquirySource.PUBLIC_ACCOUNT_AUTH,
        inquiryCode: inquiryCode(),
        inquiryType: seed.type,
        title: titleOf(seed.type),
        content: `${seed.label} 상태를 확인하기 위한 테스트 문의입니다.`,
        status: seed.status,
        replyEmail,
        createDate,
        assignedAdminId: adminId,
        processingStartedAt: startedAt,
        replyDraft: replyText,
        replyVersion: 1,
      },
    });
    if (!seed.attempt) {
      continue;
    }
    const sentAt = new Date(startedAt.getTime() + HOUR);
    const attempt = await prisma.inquiryReplyAttempt.create({
      data: {
        inquiryId: inquiry.id,
        requestId: randomUUID(),
        adminId,
        draftVersion: 1,
        toEmail: replyEmail,
        replyText,
        status: seed.attempt.status,
        deliveryMode: seed.attempt.deliveryMode,
        providerMessageId: seed.attempt.providerMessageId ?? null,
        errorCode: seed.attempt.errorCode ?? null,
        createDate: sentAt,
        finishedAt: new Date(sentAt.getTime() + 2000),
        finalizedAt: seed.attempt.finalized
          ? new Date(sentAt.getTime() + 3000)
          : null,
      },
    });
    await prisma.inquiry.update({
      where: { id: inquiry.id },
      data: {
        activeReplyAttemptId: attempt.id,
        completedAt:
          seed.status === InquiryStatus.COMPLETED
            ? new Date(sentAt.getTime() + 2000)
            : null,
      },
    });
    await prisma.adminActivityLog.create({
      data: {
        adminId,
        targetType: AdminActivityTarget.INQUIRY,
        targetId: BigInt(inquiry.id),
        targetLabel: inquiry.inquiryCode,
        action: AdminActivityAction.INQUIRY_REPLY_SEND,
        result:
          seed.attempt.status === InquiryReplyStatus.FAILED
            ? AdminActivityResult.FAILURE
            : AdminActivityResult.SUCCESS,
        summary:
          seed.status === InquiryStatus.COMPLETED
            ? '처리 중 → 처리 완료'
            : `문의 이메일 답변 발송 (${seed.label})`,
        beforeValue: { status: InquiryStatus.IN_PROGRESS },
        afterValue: { status: seed.status, outcome: seed.attempt.status },
        ipAddress: '127.0.0.1',
        createDate: sentAt,
      },
    });
  }

  // 문의 전용 토큰으로 본인 확인한 기존 경로의 문의 (회원 연결, 가입 이메일로 회신)
  if (locked?.email) {
    await prisma.inquiry.create({
      data: {
        source: InquirySource.RESTRICTED_ACCOUNT,
        userId: locked.id,
        inquiryCode: `INQ-SEED-${Date.now().toString(36).toUpperCase()}`,
        inquiryType: InquiryType.LOGIN_FAILED_LOCKED,
        title: titleOf(InquiryType.LOGIN_FAILED_LOCKED),
        content: '기존 본인 확인 경로로 접수된 테스트 문의입니다.',
        status: InquiryStatus.SUBMITTED,
        replyEmail: locked.email,
        createDate: new Date(now - 4 * DAY),
      },
    });
  }
  console.log(`케이스: 계정 문의 ${cases.length + (locked?.email ? 1 : 0)}건`);
}

function titleOf(type: InquiryType): string {
  return {
    LOGIN_FAILED_LOCKED: '계정 잠금 문의',
    SUSPENDED: '계정 정지 문의',
    PHONE_UNAVAILABLE: '등록 휴대폰 사용 불가 문의',
  }[type];
}

/** 이상 거래 유형·조치 케이스. 조치 대상은 이미 정지된 회원·거래 중지 상품이라 상태와 맞는다. */
async function createAnomalyCases(
  prisma: SeedPrisma,
  adminId: number,
): Promise<void> {
  if (
    await prisma.anomaly.count({
      where: {
        type: { in: [AnomalyType.ORDER_FAILURE, AnomalyType.BALANCE_MISMATCH] },
      },
    })
  ) {
    return;
  }
  const now = Date.now();
  const [user, blocked, pausedStock, activeStock] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { loginId: 'motuuser' } }),
    prisma.user.findUnique({ where: { loginId: 'motublocked' } }),
    prisma.stock.findFirst({
      where: { tradeStatus: TradeStatus.PAUSED, isDeleted: false },
    }),
    prisma.stock.findFirst({
      where: { tradeStatus: TradeStatus.ACTIVE, isDeleted: false },
      orderBy: { id: 'asc' },
    }),
  ]);

  const anomalies: Prisma.AnomalyUncheckedCreateInput[] = [
    {
      type: AnomalyType.ORDER_FAILURE,
      status: AnomalyStatus.PENDING,
      userId: user.id,
      stockId: activeStock?.id ?? null,
      errorCode: 'ORDER_FAILED',
      errorMessage: '주문 처리 실패',
      evidence: {
        side: 'BUY',
        orderPrice: Number(activeStock?.basePrice ?? 1000n),
        orderQty: 10,
        errorName: 'PrismaClientKnownRequestError',
        errorCode: 'P2034',
        errorMessage:
          'Transaction failed due to a write conflict or a deadlock.',
      },
      detectedDate: new Date(now - 3 * HOUR),
    },
    {
      type: AnomalyType.BALANCE_MISMATCH,
      status: AnomalyStatus.REVIEWING,
      userId: user.id,
      stockId: null,
      errorCode: 'LOCKED_CASH_MISMATCH',
      errorMessage: '예약 포인트 불일치',
      evidence: {
        lockedCash: 120_000,
        expectedLockedCash: 100_020,
        difference: 19_980,
      },
      detectedDate: new Date(now - 9 * HOUR),
    },
  ];
  if (blocked) {
    anomalies.push({
      type: AnomalyType.REPEATED_ORDER,
      status: AnomalyStatus.RESOLVED,
      userId: blocked.id,
      stockId: activeStock?.id ?? null,
      errorCode: 'REPEATED_ORDER',
      errorMessage: '반복 주문 탐지',
      evidence: {
        orderCount: 25,
        windowSeconds: 60,
        minCount: 10,
        firstOrderDate: new Date(now - 4 * DAY).toISOString(),
        lastOrderDate: new Date(now - 4 * DAY + 55_000).toISOString(),
      },
      detectedDate: new Date(now - 4 * DAY),
      action: AnomalyAction.USER_BLOCK,
      actionReason: '1분에 25건 반복 주문으로 회원 정지',
      handledById: adminId,
      handledDate: new Date(now - 4 * DAY + 2 * HOUR),
    });
  }
  if (pausedStock) {
    anomalies.push({
      type: AnomalyType.LARGE_ORDER,
      status: AnomalyStatus.RESOLVED,
      userId: user.id,
      stockId: pausedStock.id,
      errorCode: 'LARGE_ORDER',
      errorMessage: '대량 주문 탐지',
      evidence: {
        side: 'SELL',
        orderPrice: Number(pausedStock.basePrice),
        orderQty: Number(pausedStock.listedShares / 20n),
        listedShares: Number(pausedStock.listedShares),
        sharePercent: 5,
        thresholdPercent: 1,
      },
      detectedDate: new Date(now - 6 * DAY),
      action: AnomalyAction.STOCK_PAUSE,
      actionReason: '발행량 5% 대량 매도 주문으로 거래 중지',
      handledById: adminId,
      handledDate: new Date(now - 6 * DAY + HOUR),
    });
  }

  for (const data of anomalies) {
    const anomaly = await prisma.anomaly.create({ data });
    if (anomaly.action) {
      await prisma.adminActivityLog.create({
        data: {
          adminId,
          targetType: AdminActivityTarget.ANOMALY,
          targetId: BigInt(anomaly.id),
          targetLabel: `이상 거래 #${anomaly.id}`,
          action: AdminActivityAction.ANOMALY_ACTION,
          summary:
            anomaly.action === AnomalyAction.USER_BLOCK
              ? '확인중 → 처리완료 (회원 정지)'
              : '확인중 → 처리완료 (상품 거래 중지)',
          reason: anomaly.actionReason,
          beforeValue: { status: AnomalyStatus.REVIEWING },
          afterValue: {
            status: AnomalyStatus.RESOLVED,
            action: anomaly.action,
          },
          ipAddress: '127.0.0.1',
          createDate: anomaly.handledDate!,
        },
      });
    }
  }
  console.log(`케이스: 이상 거래 ${anomalies.length}건`);
}

/** 공지 임시저장·숨김 */
async function createNoticeCases(prisma: SeedPrisma): Promise<void> {
  if (
    await prisma.notice.count({
      where: { status: { in: [NoticeStatus.DRAFT, NoticeStatus.HIDDEN] } },
    })
  ) {
    return;
  }
  const now = Date.now();
  await prisma.notice.createMany({
    data: [
      {
        type: NoticeType.ALL,
        title: '[임시저장] 연말 서버 점검 안내',
        content: '게시 전 임시저장 상태인 공지입니다.',
        status: NoticeStatus.DRAFT,
        postStartDate: new Date(now + 3 * DAY),
      },
      {
        type: NoticeType.ALL,
        title: '[숨김] 이벤트 종료 안내',
        content: '관리자가 숨김 처리한 공지입니다.',
        status: NoticeStatus.HIDDEN,
        postStartDate: new Date(now - 20 * DAY),
      },
    ],
  });
  console.log('케이스: 공지 임시저장·숨김');
}

/** motuuser의 알림·지정가 알림·포인트 리셋 이력 */
async function createUserActivityCases(
  prisma: SeedPrisma,
  userId: number,
  account: { id: number; cash: bigint },
): Promise<void> {
  const now = Date.now();
  const stocks = await prisma.stock.findMany({
    where: { tradeStatus: TradeStatus.ACTIVE, isDeleted: false },
    orderBy: { id: 'asc' },
    take: 3,
  });
  if (stocks.length < 3) {
    return;
  }

  if (!(await prisma.priceAlert.count({ where: { userId } }))) {
    await prisma.priceAlert.createMany({
      data: [
        {
          userId,
          stockId: stocks[0].id,
          targetPrice: stocks[0].basePrice * 2n,
        },
        {
          userId,
          stockId: stocks[1].id,
          targetPrice: stocks[1].basePrice / 2n,
        },
        {
          // 목표가에 도달해 꺼진 알림
          userId,
          stockId: stocks[2].id,
          targetPrice: stocks[2].basePrice,
          isActive: false,
          triggeredDate: new Date(now - 2 * DAY),
        },
      ],
    });
    console.log('케이스: 지정가 알림 3건 (활성 2, 도달 1)');
  }

  const trade = await prisma.trade.findFirst({
    where: { buyOrder: { accountId: account.id } },
    orderBy: { id: 'desc' },
  });
  const draft = await prisma.listingApplication.findFirst({
    where: { userId, status: ListingApplicationStatus.DRAFT },
    orderBy: { id: 'desc' },
  });
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  if (trade) {
    for (const [index, read] of [false, true].entries()) {
      notifications.push({
        userId,
        type: NotificationType.ORDER,
        eventKey: `seed-fill:${trade.id}:${index}`,
        content: `${stocks[0].name}·${trade.qty}주·매수 주문이 체결되었습니다.`,
        payload: {
          tradeId: String(trade.id),
          orderId: String(trade.buyOrderId),
          stockId: trade.stockId,
          stockName: stocks[0].name,
          side: 'BUY',
          quantity: String(trade.qty),
          price: String(trade.price),
        },
        isRead: read,
        readAt: read ? new Date(now - 20 * HOUR) : null,
        createDate: new Date(now - (read ? 26 : 1) * HOUR),
      });
    }
  }
  const reachedAlert = await prisma.priceAlert.findFirst({
    where: { userId, isActive: false, triggeredDate: { not: null } },
  });
  notifications.push({
    userId,
    type: NotificationType.PRICE,
    eventKey: `seed-price:${stocks[2].id}`,
    content: `${stocks[2].name}·상품이 설정한 가격에 도달했습니다.`,
    payload: {
      alertId: reachedAlert?.id ?? null,
      revision: '1',
      stockId: stocks[2].id,
      stockName: stocks[2].name,
      targetPrice: String(stocks[2].basePrice),
      reachedPrice: String(stocks[2].basePrice),
    },
    createDate: new Date(now - 2 * DAY),
  });
  if (draft) {
    const expiresAt = new Date(now + 2 * DAY);
    notifications.push({
      userId,
      type: NotificationType.LISTING_DRAFT_EXPIRING,
      eventKey: `seed-draft:${draft.id}`,
      content: `${draft.serviceName ?? '작성 중인'} 임시저장 신청서가 ${kstDate(expiresAt).replaceAll('-', '. ')}.에 만료됩니다. 계속 작성하려면 만료 전에 저장해 주세요.`,
      payload: {
        applicationId: draft.id,
        serviceName: draft.serviceName,
        expiresAt: expiresAt.toISOString(),
      },
      createDate: new Date(now - 3 * HOUR),
    });
  }
  const { count } = await prisma.notification.createMany({
    data: notifications,
    skipDuplicates: true,
  });
  if (count > 0) {
    console.log(`케이스: 알림 ${count}건`);
  }

  if (
    !(await prisma.pointResetHistory.count({
      where: { accountId: account.id },
    }))
  ) {
    await prisma.pointResetHistory.create({
      data: {
        accountId: account.id,
        result: PointResetResult.NOT_ALLOWED,
        cashBefore: account.cash,
        failedConditions: [
          PointResetCondition.NO_HOLDINGS,
          PointResetCondition.CASH_BELOW_LIMIT,
        ],
        createDate: new Date(now - 1 * DAY),
      },
    });
    console.log('케이스: 포인트 리셋 실패 이력');
  }
}

/** 한국 시간 날짜 YYYY-MM-DD */
function kstDate(date: Date): string {
  return new Date(date.getTime() + 9 * HOUR).toISOString().slice(0, 10);
}

// `npm run db:seed:cases`로 따로 실행할 때
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await seedCases(
      prisma,
      await hash(process.env.SEED_USER_PASSWORD ?? 'motuuser1!'),
      await hash(process.env.SEED_ADMIN_PASSWORD ?? 'motuadmin1!'),
    );
  } finally {
    await prisma.$disconnect();
  }
}
