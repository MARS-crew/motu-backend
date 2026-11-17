import { Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import {
  BusinessException,
  ErrorDefinition,
} from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { maskPhoneNumber } from '../../common/utils/masking.js';
import {
  Prisma,
  TwoFactorStatus,
  User,
  UserStatus,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { VerificationsService } from '../verifications/verifications.service.js';
import { CreateUserReqDto } from './dto/req/create-user-req.dto.js';
import { CheckAvailabilityResDto } from './dto/res/check-availability-res.dto.js';
import { CreateUserResDto } from './dto/res/create-user-res.dto.js';
import { GetMyInfoResDto } from './dto/res/get-my-info-res.dto.js';
import { SendContactPhoneVerificationResDto } from './dto/res/send-contact-phone-verification-res.dto.js';
import { SendEmailVerificationResDto } from './dto/res/send-email-verification-res.dto.js';
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
          nickname: user.nickname,
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

  async getMyInfo(userId: number): Promise<GetMyInfoResDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BusinessException(UserErrors.NOT_FOUND);
    }
    return {
      userId: user.id,
      loginId: user.loginId,
      nickname: user.nickname,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      userStatus: user.userStatus,
      twoFactorStatus: user.twoFactorStatus,
    };
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

  /**
   * 인증번호가 맞으면 연락처를 그 번호로 바꾼다. 2차 보안 번호는 바꾸지 않는다.
   */
  async changeContactPhone(
    userId: number,
    phoneNumber: string,
    code: string,
  ): Promise<GetMyInfoResDto> {
    const user = await this.findContactChangeUser(userId, phoneNumber);
    const target = contactPhoneTarget(user.id, phoneNumber);
    await this.verificationsService.confirmSmsCode(
      VerificationPurpose.CONTACT_PHONE_CHANGE,
      target,
      code,
    );
    await this.prisma.$transaction(async (tx) => {
      await this.verificationsService.consumeVerified(
        tx,
        VerificationChannel.SMS,
        VerificationPurpose.CONTACT_PHONE_CHANGE,
        target,
      );
      await tx.user.update({ where: { id: user.id }, data: { phoneNumber } });
    });
    return this.getMyInfo(userId);
  }

  private async findContactChangeUser(
    userId: number,
    phoneNumber: string,
  ): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
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
