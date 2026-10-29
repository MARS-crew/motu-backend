import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { length as isLength } from 'class-validator';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EnvironmentVariables } from '../../config/env.validation.js';
import {
  InquiryType,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client.js';
import type { LoginReqDto } from '../auth/dto/req/login-req.dto.js';
import type { CreateInquiryReqDto } from './dto/req/create-inquiry-req.dto.js';
import {
  INQUIRY_TOKEN_AUDIENCE,
  INQUIRY_TOKEN_ISSUER,
  INQUIRY_TOKEN_TTL,
  INQUIRY_MAX_FAILURES,
  INQUIRY_BLOCK_MS,
  INQUIRY_TITLE_MAX_LENGTH,
  INQUIRY_CONTENT_MAX_LENGTH,
  inquiryTokenSecret,
} from './inquiries.constants.js';
import { InquiryErrors as Errors } from './inquiries.errors.js';

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async createAccessToken(dto: LoginReqDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      // 정상/없는 계정은 비밀번호 해시를 확인하지 않는다. 상태 확인과 실패 집계를
      // 회원 행 잠금 안에서 직렬화해 동시 요청/여러 인스턴스에서도 상한을 지킨다.
      const [user] = await tx.$queryRaw<{ id: number; password: string }[]>`
        SELECT user_id AS id, password FROM users
        WHERE login_id=${dto.loginId} AND user_status IN ('LOCKED', 'BLOCKED')
        FOR UPDATE
      `;
      if (!user) return { error: Errors.INVALID_CREDENTIALS };
      const saved = await tx.inquiryAccessAttempt.findUnique({
        where: { userId: user.id },
      });
      const now = Date.now();
      if (saved?.blockedUntil && saved.blockedUntil.getTime() > now)
        return { error: Errors.ACCESS_TEMPORARILY_BLOCKED };
      if (!(await verify(user.password, dto.password))) {
        const failCount =
          (saved?.blockedUntil ? 0 : (saved?.failCount ?? 0)) + 1;
        const blocked = failCount >= INQUIRY_MAX_FAILURES;
        const data = {
          failCount,
          blockedUntil: blocked
            ? new Date(Date.now() + INQUIRY_BLOCK_MS)
            : null,
        };
        await tx.inquiryAccessAttempt.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...data },
          update: data,
        });
        // 커밋 후 예외를 던져 실패 기록이 롤백되지 않도록 한다.
        return {
          error: blocked
            ? Errors.ACCESS_TEMPORARILY_BLOCKED
            : Errors.INVALID_CREDENTIALS,
        };
      }
      await tx.inquiryAccessAttempt.deleteMany({ where: { userId: user.id } });
      return { userId: user.id };
    });
    if (result.error) throw new BusinessException(result.error);
    // 로그인 성공 처리, Refresh 토큰 발급, 계정 해제를 수행하지 않는다.
    return {
      inquiryAccessToken: await this.jwt.signAsync(
        { sub: result.userId, purpose: 'INQUIRY' },
        {
          secret: inquiryTokenSecret(
            this.config.get('JWT_ACCESS_SECRET', { infer: true }),
          ),
          issuer: INQUIRY_TOKEN_ISSUER,
          audience: INQUIRY_TOKEN_AUDIENCE,
          expiresIn: INQUIRY_TOKEN_TTL,
        },
      ),
      expiresIn: INQUIRY_TOKEN_TTL,
    };
  }

  async create(userId: number, dto: CreateInquiryReqDto) {
    // DTO 경로를 거치지 않는 내부 호출도 같은 길이/타입 검증을 적용한다.
    const title = typeof dto.title === 'string' ? dto.title.trim() : dto.title;
    const content =
      typeof dto.content === 'string' ? dto.content.trim() : dto.content;
    if (
      typeof title !== 'string' ||
      !isLength(title, 1, INQUIRY_TITLE_MAX_LENGTH)
    )
      throw new BusinessException(Errors.INVALID_TITLE);
    if (
      typeof content !== 'string' ||
      !isLength(content, 1, INQUIRY_CONTENT_MAX_LENGTH)
    )
      throw new BusinessException(Errors.INVALID_CONTENT);
    // 상태 확인과 접수를 함께 잠가, 접수 도중 계정이 해제되는 경합을 제어한다.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const users = await tx.$queryRaw<{ userStatus: UserStatus }[]>`
            SELECT user_status AS "userStatus" FROM users WHERE user_id=${userId} FOR UPDATE
          `;
          const user = users[0];
          if (!user) throw new BusinessException(Errors.UNAUTHORIZED);
          if (!isRestricted(user.userStatus))
            throw new BusinessException(Errors.ACCOUNT_NOT_RESTRICTED);
          const date = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
            .format(new Date())
            .replaceAll('-', '');
          return tx.inquiry.create({
            data: {
              userId,
              title,
              content,
              inquiryCode: `INQ-${date}-${randomBytes(6).toString('hex').toUpperCase()}`,
              inquiryType:
                user.userStatus === UserStatus.LOCKED
                  ? InquiryType.LOGIN_FAILED_LOCKED
                  : InquiryType.SUSPENDED,
            },
            select: inquirySelect,
          });
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002' ||
          attempt === 2
        )
          throw error;
      }
    }
    throw new Error('문의번호 생성 실패');
  }

  async list(userId: number, page: number, size: number) {
    const [items, totalCount] = await this.prisma.$transaction(
      [
        this.prisma.inquiry.findMany({
          where: { userId },
          orderBy: [{ createDate: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * size,
          take: size,
          select: inquirySelect,
        }),
        this.prisma.inquiry.count({ where: { userId } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, page, size, totalCount };
  }

  async detail(userId: number, id: number) {
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
      throw new BusinessException(Errors.NOT_FOUND);
    const inquiry = await this.prisma.inquiry.findFirst({
      where: { id, userId },
      select: inquirySelect,
    });
    if (!inquiry) throw new BusinessException(Errors.NOT_FOUND);
    return inquiry;
  }
}

export function isRestricted(status: UserStatus): boolean {
  return status === UserStatus.LOCKED || status === UserStatus.BLOCKED;
}

const inquirySelect = {
  id: true,
  inquiryCode: true,
  inquiryType: true,
  title: true,
  content: true,
  status: true,
  createDate: true,
  modifiedDate: true,
} satisfies Prisma.InquirySelect;
