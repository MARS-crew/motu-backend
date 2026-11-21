import { Injectable } from '@nestjs/common';
import { hash, verify } from 'argon2';
import {
  BusinessException,
  ErrorDefinition,
} from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { adminDisplayName } from '../../common/utils/admin-display-name.js';
import { maskPhoneNumber } from '../../common/utils/masking.js';
import {
  Prisma,
  Role,
  TwoFactorStatus,
  User,
  UserStatus,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import {
  VERIFIED_TTL_MS,
  VerificationsService,
} from '../verifications/verifications.service.js';
import { CreateUserReqDto } from './dto/req/create-user-req.dto.js';
import { UpdateMyInfoReqDto } from './dto/req/update-my-info-req.dto.js';
import { CheckAvailabilityResDto } from './dto/res/check-availability-res.dto.js';
import { ConfirmContactPhoneVerificationResDto } from './dto/res/confirm-contact-phone-verification-res.dto.js';
import { ConfirmProfileEmailVerificationResDto } from './dto/res/confirm-profile-email-verification-res.dto.js';
import { CreateUserResDto } from './dto/res/create-user-res.dto.js';
import { GetMyInfoResDto } from './dto/res/get-my-info-res.dto.js';
import { SendContactPhoneVerificationResDto } from './dto/res/send-contact-phone-verification-res.dto.js';
import { SendEmailVerificationResDto } from './dto/res/send-email-verification-res.dto.js';
import { UpdateMyInfoResDto } from './dto/res/update-my-info-res.dto.js';
import { MAX_LOGIN_FAIL_COUNT } from './users.constants.js';
import { UserErrors } from './users.errors.js';

type UniqueField = 'loginId' | 'nickname' | 'email';

const DUPLICATED_ERRORS: Record<UniqueField, ErrorDefinition> = {
  loginId: UserErrors.LOGIN_ID_DUPLICATED,
  nickname: UserErrors.NICKNAME_DUPLICATED,
  email: UserErrors.EMAIL_DUPLICATED,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly verificationsService: VerificationsService,
  ) {}

  async checkLoginId(loginId: string): Promise<CheckAvailabilityResDto> {
    return { available: !(await this.exists('loginId', loginId)) };
  }

  async checkNickname(nickname: string): Promise<CheckAvailabilityResDto> {
    return { available: !(await this.exists('nickname', nickname)) };
  }

  async sendSignupEmailCode(
    email: string,
  ): Promise<SendEmailVerificationResDto> {
    await this.assertNotDuplicated('email', email);
    return this.verificationsService.sendEmailCode(
      VerificationPurpose.SIGNUP,
      email,
    );
  }

  async confirmSignupEmailCode(email: string, code: string): Promise<void> {
    await this.verificationsService.confirmEmailCode(
      VerificationPurpose.SIGNUP,
      email,
      code,
    );
  }

  async create(dto: CreateUserReqDto): Promise<CreateUserResDto> {
    await this.assertNotDuplicated('loginId', dto.loginId);
    await this.assertNotDuplicated('nickname', dto.nickname);
    await this.assertNotDuplicated('email', dto.email);

    const password = await hash(dto.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.verificationsService.consumeVerified(
          tx,
          VerificationChannel.EMAIL,
          VerificationPurpose.SIGNUP,
          dto.email,
        );

        const user = await tx.user.create({
          data: {
            loginId: dto.loginId,
            password,
            nickname: dto.nickname,
            email: dto.email,
            phoneNumber: dto.phoneNumber,
            birthDate: new Date(dto.birthDate),
            termsAgreed: dto.termsAgreed,
            privacyAgreed: dto.privacyAgreed,
            marketingAgreed: dto.marketingAgreed,
          },
        });
        const account = await this.accountsService.createInitialAccount(
          tx,
          user.id,
        );

        return {
          userId: user.id,
          loginId: user.loginId,
          nickname: dto.nickname,
          userStatus: user.userStatus,
          role: user.role,
          cash: Number(account.cash),
        };
      });
    } catch (error) {
      // 중복 확인과 가입 사이에 같은 값으로 먼저 가입한 경우
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BusinessException(this.findDuplicatedError(error));
      }
      throw error;
    }
  }

  /** 마이페이지에 표시할 회원 정보를 조회한다. */
  async getMyInfo(userId: number): Promise<GetMyInfoResDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { adminProfile: { select: { name: true } } },
    });
    if (!user) {
      throw new BusinessException(UserErrors.NOT_FOUND);
    }
    return this.toMyInfo(user);
  }

  /**
   * 회원 정보 응답에 필요한 필드만 골라 반환한다.
   * 관리자는 닉네임 대신 관리자명을 쓴다. 관리자 계정 생성 API로 만든 관리자는 닉네임이 없다.
   */
  private toMyInfo(
    user: User & { adminProfile?: { name: string } | null },
  ): GetMyInfoResDto {
    const nickname =
      user.role === Role.ADMIN ? adminDisplayName(user) : user.nickname;
    if (
      user.userStatus === UserStatus.WITHDRAWN ||
      user.email === null ||
      nickname === null
    ) {
      throw new BusinessException(UserErrors.NOT_FOUND);
    }
    return {
      userId: user.id,
      loginId: user.loginId,
      nickname,
      email: user.email,
      birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
      phoneNumber: user.phoneNumber,
      role: user.role,
      userStatus: user.userStatus,
      twoFactorStatus: user.twoFactorStatus,
    };
  }

  /**
   * 회원정보 수정(USR-MY-02) 전 가입 이메일로 인증번호를 보낸다.
   * 입력한 이메일이 가입 이메일과 달라도 발송하지 않는다.
   */
  async sendProfileEmailCode(
    userId: number,
    email: string,
  ): Promise<SendEmailVerificationResDto> {
    const user = await this.findProfileUpdateUser(userId, email);
    return this.verificationsService.sendEmailCode(
      VerificationPurpose.PROFILE_UPDATE,
      email,
      profileEmailTarget(user.id, email),
    );
  }

  /** 인증번호가 맞으면 정해진 시간 안에 회원정보를 한 번 수정할 수 있다. */
  async confirmProfileEmailCode(
    userId: number,
    email: string,
    code: string,
  ): Promise<ConfirmProfileEmailVerificationResDto> {
    const user = await this.findProfileUpdateUser(userId, email);
    await this.verificationsService.confirmEmailCode(
      VerificationPurpose.PROFILE_UPDATE,
      profileEmailTarget(user.id, email),
      code,
    );
    return {
      verified: true,
      editableUntil: new Date(Date.now() + VERIFIED_TTL_MS),
    };
  }

  /**
   * 가입 이메일 인증을 마친 회원의 비밀번호·생년월일을 바꾼다(USR-MY-03).
   * 인증 결과는 이 수정에 한 번 쓰인다. 비밀번호를 바꾸면 모든 기기에서 로그아웃하고 신뢰 기기를 지운다.
   */
  async updateMyInfo(
    userId: number,
    dto: UpdateMyInfoReqDto,
  ): Promise<UpdateMyInfoResDto> {
    if (dto.password === undefined && dto.birthDate === undefined) {
      throw new BusinessException(UserErrors.NOTHING_TO_UPDATE);
    }
    const user = await this.findById(userId);
    if (!user || user.userStatus === UserStatus.WITHDRAWN || !user.email) {
      throw new BusinessException(UserErrors.NOT_FOUND);
    }
    if (
      dto.password !== undefined &&
      (await verify(user.password, dto.password))
    ) {
      throw new BusinessException(UserErrors.SAME_PASSWORD);
    }
    const password =
      dto.password === undefined ? undefined : await hash(dto.password);
    const email = user.email;

    await this.prisma.$transaction(async (tx) => {
      await this.verificationsService.consumeVerified(
        tx,
        VerificationChannel.EMAIL,
        VerificationPurpose.PROFILE_UPDATE,
        profileEmailTarget(user.id, email),
      );
      const { count } = await tx.user.updateMany({
        // 인증한 이메일이 그대로인 회원만 바꾼다.
        where: {
          id: user.id,
          email,
          userStatus: { not: UserStatus.WITHDRAWN },
        },
        data: {
          ...(password && { password }),
          ...(dto.birthDate && { birthDate: new Date(dto.birthDate) }),
        },
      });
      if (count === 0) {
        throw new BusinessException(UserErrors.NOT_FOUND);
      }
      if (password) {
        const now = new Date();
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        });
        await tx.trustedDevice.deleteMany({ where: { userId: user.id } });
      }
    });

    return Object.assign(await this.getMyInfo(user.id), {
      reloginRequired: password !== undefined,
    });
  }

  /** 회원정보 수정을 할 수 있는 회원인지, 입력한 이메일이 가입 이메일인지 확인한다. */
  private async findProfileUpdateUser(
    userId: number,
    email: string,
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user || user.userStatus === UserStatus.WITHDRAWN || !user.email) {
      throw new BusinessException(UserErrors.NOT_FOUND);
    }
    if (user.email !== email) {
      throw new BusinessException(UserErrors.EMAIL_MISMATCH);
    }
    return user;
  }

  /**
   * 연락처 변경용 인증번호를 새 번호로 보낸다. 2차 보안을 설정한 회원만 바꿀 수 있다.
   * 다른 번호로 받아 둔 인증번호는 쓸 수 없게 한다.
   */
  async sendContactPhoneCode(
    userId: number,
    phoneNumber: string,
  ): Promise<SendContactPhoneVerificationResDto> {
    const user = await this.findContactChangeUser(userId, phoneNumber);
    const target = contactPhoneTarget(user.id, phoneNumber);
    const sent = await this.verificationsService.sendSmsCode(
      VerificationPurpose.CONTACT_PHONE_CHANGE,
      phoneNumber,
      target,
    );
    await this.verificationsService.invalidateOthers(
      VerificationChannel.SMS,
      VerificationPurpose.CONTACT_PHONE_CHANGE,
      `${user.id}:`,
      target,
    );
    return { maskedPhoneNumber: maskPhoneNumber(phoneNumber), ...sent };
  }

  /** SMS 인증번호를 확인한다. 연락처는 회원이 변경 요청을 보낼 때 저장한다. */
  async confirmContactPhoneCode(
    userId: number,
    phoneNumber: string,
    code: string,
  ): Promise<ConfirmContactPhoneVerificationResDto> {
    const user = await this.findContactChangeUser(userId, phoneNumber);
    await this.verificationsService.confirmSmsCode(
      VerificationPurpose.CONTACT_PHONE_CHANGE,
      contactPhoneTarget(user.id, phoneNumber),
      code,
    );
    return { verified: true };
  }

  /** 가입 연락처 변경과 SMS 인증 결과 사용 처리를 한 트랜잭션에서 수행한다. */
  async changeContactPhone(
    userId: number,
    phoneNumber: string,
  ): Promise<GetMyInfoResDto> {
    const user = await this.findContactChangeUser(userId, phoneNumber);
    const target = contactPhoneTarget(user.id, phoneNumber);
    await this.prisma.$transaction(async (tx) => {
      await this.verificationsService.consumeVerified(
        tx,
        VerificationChannel.SMS,
        VerificationPurpose.CONTACT_PHONE_CHANGE,
        target,
      );
      const { count } = await tx.user.updateMany({
        where: {
          id: userId,
          userStatus: UserStatus.ACTIVE,
          twoFactorStatus: TwoFactorStatus.ENABLED,
          phoneNumber: user.phoneNumber,
        },
        data: { phoneNumber },
      });
      if (count === 0) {
        await this.findContactChangeUser(userId, phoneNumber, tx);
        throw new BusinessException(UserErrors.STATUS_CONFLICT);
      }
    });
    return this.getMyInfo(userId);
  }

  private async findContactChangeUser(
    userId: number,
    phoneNumber: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<User> {
    const user = await client.user.findUnique({ where: { id: userId } });
    if (!user || user.userStatus !== UserStatus.ACTIVE) {
      throw new BusinessException(UserErrors.NOT_FOUND);
    }
    if (user.twoFactorStatus !== TwoFactorStatus.ENABLED) {
      throw new BusinessException(UserErrors.CONTACT_TWO_FACTOR_REQUIRED);
    }
    if (user.phoneNumber === phoneNumber) {
      throw new BusinessException(UserErrors.SAME_PHONE_NUMBER);
    }
    return user;
  }

  /** 로그인용 조회. 비밀번호 해시가 포함되므로 응답에 그대로 내보내지 않는다. */
  findByLoginId(loginId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { loginId } });
  }

  findById(userId: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** 새 비밀번호를 해시해 저장한다. 비밀번호 형식 검증은 요청 DTO에서 한다. */
  async changePassword(userId: number, newPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await hash(newPassword) },
    });
  }

  /**
   * 로그인 실패 횟수를 1 늘리고, 최대 횟수에 도달하면 계정을 잠근다.
   * @returns 늘어난 실패 횟수와 잠금 여부
   */
  async recordLoginFailure(
    userId: number,
  ): Promise<{ failCount: number; locked: boolean }> {
    const { loginFailCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { loginFailCount: { increment: 1 } },
      select: { loginFailCount: true },
    });

    const locked = loginFailCount >= MAX_LOGIN_FAIL_COUNT;
    if (locked) {
      await this.prisma.user.updateMany({
        where: { id: userId, userStatus: UserStatus.ACTIVE },
        data: { userStatus: UserStatus.LOCKED },
      });
    }
    return { failCount: loginFailCount, locked };
  }

  /** 로그인 성공 시 실패 횟수를 초기화하고 최근 접속일을 갱신한다. */
  async recordLoginSuccess(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { loginFailCount: 0, lastLoginDate: new Date() },
    });
  }

  private async exists(field: UniqueField, value: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { [field]: value } });
    return count > 0;
  }

  private async assertNotDuplicated(
    field: UniqueField,
    value: string,
  ): Promise<void> {
    if (await this.exists(field, value)) {
      throw new BusinessException(DUPLICATED_ERRORS[field]);
    }
  }

  private findDuplicatedError(
    error: Prisma.PrismaClientKnownRequestError,
  ): ErrorDefinition {
    const meta = JSON.stringify(error.meta ?? {});
    const field = (Object.keys(DUPLICATED_ERRORS) as UniqueField[]).find(
      (key) => meta.includes(key) || meta.includes(toColumnName(key)),
    );
    return field ? DUPLICATED_ERRORS[field] : UserErrors.DUPLICATED;
  }
}

function toColumnName(field: UniqueField): string {
  return field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

/** 회원마다 따로 인증하도록 인증번호 대상을 회원 ID와 번호로 만든다. */
function contactPhoneTarget(userId: number, phoneNumber: string): string {
  return `${userId}:${phoneNumber}`;
}

/** 회원정보 수정 인증번호를 회원별로 구분하는 값 */
function profileEmailTarget(userId: number, email: string): string {
  return `${userId}:${email}`;
}
