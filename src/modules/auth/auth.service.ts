import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify } from 'argon2';
import { AuthUser } from '../../common/auth/auth-user.type.js';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { EnvironmentVariables } from '../../config/env.validation.js';
import { User, UserStatus } from '../../generated/prisma/client.js';
import { MAX_LOGIN_FAIL_COUNT } from '../users/users.constants.js';
import { UsersService } from '../users/users.service.js';
import { AuthErrors } from './auth.errors.js';
import { REFRESH_TOKEN_BYTES } from './auth.constants.js';
import { LoginReqDto } from './dto/req/login-req.dto.js';
import { LoginResDto } from './dto/res/login-res.dto.js';
import { RefreshTokenResDto } from './dto/res/refresh-token-res.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly usersService: UsersService,
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
