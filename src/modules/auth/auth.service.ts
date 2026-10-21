import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { AuthUser } from '../../common/auth/auth-user.type.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { MailSender } from '../../common/mail/mail-sender.js';
import {
  User,
  UserStatus,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { MAX_LOGIN_FAIL_COUNT } from '../users/users.constants.js';
import { UsersService } from '../users/users.service.js';
import { VerificationsService } from '../verifications/verifications.service.js';
import { AuthErrors } from './auth.errors.js';
import {
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_BYTES,
} from './auth.constants.js';
import { LoginReqDto } from './dto/req/login-req.dto.js';
import { FindLoginIdResDto } from './dto/res/find-login-id-res.dto.js';
import { LoginResDto } from './dto/res/login-res.dto.js';
import { RefreshTokenResDto } from './dto/res/refresh-token-res.dto.js';
import { SendLoginIdVerificationResDto } from './dto/res/send-login-id-verification-res.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly usersService: UsersService,
    private readonly verificationsService: VerificationsService,
    private readonly mailSender: MailSender,
  ) {}

  async login(dto: LoginReqDto): Promise<LoginResDto> {
    const user = await this.usersService.findByLoginId(dto.loginId);
    if (!user) {
      throw new BusinessException(AuthErrors.INVALID_CREDENTIALS);
    }
    this.assertLoginAllowed(user);

    if (!(await verify(user.password, dto.password))) {
      const { failCount, locked } = await this.usersService.recordLoginFailure(
        user.id,
      );
      if (locked) {
        throw new BusinessException(AuthErrors.ACCOUNT_LOCKED);
      }
      throw new BusinessException(AuthErrors.INVALID_CREDENTIALS, undefined, {
        failCount,
        maxFailCount: MAX_LOGIN_FAIL_COUNT,
      });
    }

    await this.usersService.recordLoginSuccess(user.id);
    const { accessToken, accessTokenExpiresIn, refreshToken } =
      await this.issueTokens({ userId: user.id, role: user.role });

    return {
      accessToken,
      accessTokenExpiresIn,
      refreshToken,
      user: {
        userId: user.id,
        loginId: user.loginId,
        nickname: user.nickname,
        role: user.role,
      },
    };
  }

  /**
   * Refresh 토큰으로 새 토큰을 발급한다. 사용한 Refresh 토큰은 폐기한다.
   */
  async refresh(refreshToken: string): Promise<RefreshTokenResDto> {
    const saved = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
    });
    if (!saved || saved.expiresAt.getTime() <= Date.now()) {
      throw new BusinessException(AuthErrors.INVALID_REFRESH_TOKEN);
    }
    if (saved.revokedAt) {
      // 이미 폐기된 토큰이 다시 쓰였다면 탈취 가능성이 있으므로 그 사용자의 세션을 모두 끊는다.
      await this.revokeAllSessions(saved.userId);
      throw new BusinessException(AuthErrors.INVALID_REFRESH_TOKEN);
    }

    const user = await this.usersService.findById(saved.userId);
    if (!user) {
      throw new BusinessException(AuthErrors.INVALID_REFRESH_TOKEN);
    }
    this.assertLoginAllowed(user);

    // 동시에 같은 토큰으로 재발급을 요청하면 한 요청만 성공한다.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: saved.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new BusinessException(AuthErrors.INVALID_REFRESH_TOKEN);
    }

    return this.issueTokens({ userId: user.id, role: user.role });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** 비밀번호 변경 등으로 모든 기기에서 로그아웃시킬 때 쓴다. */
  async revokeAllSessions(userId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async sendFindLoginIdCode(
    email: string,
  ): Promise<SendLoginIdVerificationResDto> {
    if (!(await this.usersService.findByEmail(email))) {
      throw new BusinessException(AuthErrors.EMAIL_NOT_REGISTERED);
    }
    return this.verificationsService.sendEmailCode(
      VerificationPurpose.FIND_LOGIN_ID,
      email,
    );
  }

  /** 인증번호가 맞으면 일부를 가린 아이디를 알려준다. 인증 결과는 한 번만 쓸 수 있다. */
  async findLoginId(email: string, code: string): Promise<FindLoginIdResDto> {
    await this.verificationsService.confirmEmailCode(
      VerificationPurpose.FIND_LOGIN_ID,
      email,
      code,
    );
    await this.verificationsService.consumeVerified(
      this.prisma,
      VerificationChannel.EMAIL,
      VerificationPurpose.FIND_LOGIN_ID,
      email,
    );

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BusinessException(AuthErrors.EMAIL_NOT_REGISTERED);
    }
    return { maskedLoginId: maskLoginId(user.loginId) };
  }

  /**
   * 아이디·이메일이 맞는 정상 계정이면 재설정 링크를 메일로 보낸다.
   * 가입 여부를 노출하지 않도록 조건이 맞지 않아도 에러 없이 끝낸다.
   */
  async requestPasswordReset(loginId: string, email: string): Promise<void> {
    const user = await this.usersService.findByLoginId(loginId);
    if (
      !user ||
      user.email !== email ||
      user.userStatus !== UserStatus.ACTIVE
    ) {
      return;
    }

    const latest = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createDate: 'desc' },
    });
    const now = new Date();
    if (
      latest &&
      now.getTime() - latest.createDate.getTime() < PASSWORD_RESET_COOLDOWN_MS
    ) {
      return;
    }

    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    await this.prisma.$transaction([
      // 새 링크를 보내면 이전 링크는 쓸 수 없다.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(token),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
          createDate: now,
        },
      }),
    ]);

    const url = new URL(this.config.get('PASSWORD_RESET_URL', { infer: true }));
    url.searchParams.set('token', token);
    await this.mailSender.send({
      to: email,
      subject: '[MOTU] 비밀번호 재설정 안내',
      text: `아래 링크에서 새 비밀번호를 설정해 주세요. 링크는 30분 동안 한 번만 사용할 수 있습니다.\n${url.toString()}`,
    });
  }

  /** 재설정 링크를 열었을 때 사용할 수 있는 링크인지 확인한다. */
  async verifyPasswordResetToken(token: string): Promise<void> {
    await this.findUsableResetToken(token);
  }

  /** 비밀번호를 바꾸고 모든 기기에서 로그아웃시킨다. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const saved = await this.findUsableResetToken(token);

    const user = await this.usersService.findById(saved.userId);
    if (!user) {
      throw new BusinessException(AuthErrors.INVALID_PASSWORD_RESET_TOKEN);
    }
    this.assertLoginAllowed(user);

    // 같은 링크로 동시에 요청해도 한 번만 처리한다.
    const { count } = await this.prisma.passwordResetToken.updateMany({
      where: { id: saved.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) {
      throw new BusinessException(AuthErrors.INVALID_PASSWORD_RESET_TOKEN);
    }

    await this.usersService.changePassword(user.id, newPassword);
    await this.revokeAllSessions(user.id);
  }

  private async findUsableResetToken(token: string) {
    const saved = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!saved || saved.usedAt || saved.expiresAt.getTime() <= Date.now()) {
      throw new BusinessException(AuthErrors.INVALID_PASSWORD_RESET_TOKEN);
    }
    return saved;
  }

  /**
   * 로그인한 회원이 계속 이용할 수 있는 상태인지 확인한다. 인증 Guard가 요청마다 호출한다.
   * Access 토큰을 받은 뒤 잠기거나 정지된 회원을 막기 위해서다.
   */
  async assertUserActive(userId: number): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BusinessException(AuthErrors.UNAUTHORIZED);
    }
    this.assertLoginAllowed(user);
  }

  private assertLoginAllowed(user: User): void {
    if (user.userStatus === UserStatus.LOCKED) {
      throw new BusinessException(AuthErrors.ACCOUNT_LOCKED);
    }
    if (user.userStatus === UserStatus.BLOCKED) {
      throw new BusinessException(AuthErrors.ACCOUNT_BLOCKED);
    }
  }

  private async issueTokens(user: AuthUser): Promise<RefreshTokenResDto> {
    const accessToken = await this.jwtService.signAsync({
      sub: user.userId,
      role: user.role,
    });
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const refreshDays = this.config.get('JWT_REFRESH_EXPIRES_IN_DAYS', {
      infer: true,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshDays * DAY_MS),
      },
    });

    return {
      accessToken,
      accessTokenExpiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', {
        infer: true,
      }),
      refreshToken,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/**
 * 아이디 일부를 가린다. 앞 3자(8자 미만이면 2자)와 뒤 2자(8자 이상일 때만)를 남긴다.
 * 예) minhyuk01 → min***01, motu01 → mo***
 */
export function maskLoginId(loginId: string): string {
  const long = loginId.length >= 8;
  const head = loginId.slice(0, long ? 3 : 2);
  const tail = long ? loginId.slice(-2) : '';
  return `${head}***${tail}`;
}
