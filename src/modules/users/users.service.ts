import { ConflictException, Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  Prisma,
  VerificationChannel,
  VerificationPurpose,
} from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { VerificationsService } from '../verifications/verifications.service.js';
import { CreateUserReqDto } from './dto/req/create-user-req.dto.js';
import { CheckAvailabilityResDto } from './dto/res/check-availability-res.dto.js';
import { CreateUserResDto } from './dto/res/create-user-res.dto.js';
import { SendEmailVerificationResDto } from './dto/res/send-email-verification-res.dto.js';

type UniqueField = 'loginId' | 'nickname' | 'email';

const DUPLICATED_ERRORS: Record<
  UniqueField,
  { code: string; message: string }
> = {
  loginId: {
    code: 'LOGIN_ID_DUPLICATED',
    message: '이미 사용 중인 아이디입니다.',
  },
  nickname: {
    code: 'NICKNAME_DUPLICATED',
    message: '이미 사용 중인 닉네임입니다.',
  },
  email: { code: 'EMAIL_DUPLICATED', message: '이미 가입된 이메일입니다.' },
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
        throw new ConflictException(this.findDuplicatedError(error));
      }
      throw error;
    }
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
      throw new ConflictException(DUPLICATED_ERRORS[field]);
    }
  }

  private findDuplicatedError(error: Prisma.PrismaClientKnownRequestError) {
    const meta = JSON.stringify(error.meta ?? {});
    const field = (Object.keys(DUPLICATED_ERRORS) as UniqueField[]).find(
      (key) => meta.includes(key) || meta.includes(toColumnName(key)),
    );
    return field
      ? DUPLICATED_ERRORS[field]
      : { code: 'USER_DUPLICATED', message: '이미 가입된 정보입니다.' };
  }
}

function toColumnName(field: UniqueField): string {
  return field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}
