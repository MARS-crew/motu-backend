import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  ListingApplicationStatus as Status,
  UserStatus,
  type ListingApplication,
  type Prisma,
} from '../../generated/prisma/client.js';
import { AuthErrors } from '../auth/auth.errors.js';
import { FilesService } from '../files/files.service.js';
import { TwoFactorService } from '../two-factor/two-factor.service.js';
import { TwoFactorAction } from '../two-factor/two-factor.constants.js';
import { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';
import type { SubmitListingReqDto } from './dto/req/submit-listing-req.dto.js';
import type { ListingSubmissionResDto } from './dto/res/listing-submission-res.dto.js';
import {
  ListingApplicationNumbersService,
  listingNumberDate,
} from './listing-application-numbers.service.js';
import { ListingApplicationErrors as ApplicationErrors } from './listing-applications.errors.js';
import { ListingSubmissionErrors as Errors } from './listing-submission.errors.js';
import { ListingStepValidationService } from './listing-step-validation.service.js';
import { validateListingStepFields } from './listing-steps.validation.js';

@Injectable()
export class ListingSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly steps: ListingStepValidationService,
    private readonly files: FilesService,
    private readonly twoFactor: TwoFactorService,
    private readonly numbers: ListingApplicationNumbersService,
  ) {}

  async submit(
    userId: number,
    id: number,
    dto: SubmitListingReqDto,
  ): Promise<ListingSubmissionResDto> {
    if (
      ![userId, id].every(
        (v) => Number.isSafeInteger(v) && v > 0 && v <= 2147483647,
      )
    ) {
      throw new BusinessException(ApplicationErrors.NOT_FOUND);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // 임시저장 생성·수정·삭제와 같은 회원 행 잠금이다. 제출과 자동 저장을 직렬화한다.
            await tx.$queryRaw`SELECT user_id FROM users WHERE user_id=${userId} FOR UPDATE`;
            await this.assertActive(tx, userId);
            let app = await tx.listingApplication.findFirst({
              where: { id, userId, deletedDate: null },
            });
            if (!app) {
              throw new BusinessException(ApplicationErrors.NOT_FOUND);
            }
            // 이미 접수된 건은 신청서/계좌 잠금을 추가로 얻지 않는다. 심사·탈퇴 잠금과의 역순 경합을 피한다.
            if (app.status !== Status.DRAFT) {
              if (app.status === Status.EXPIRED) {
                throw new BusinessException(ApplicationErrors.EXPIRED);
              }
              if (app.applicationNumber && app.submittedAt) {
                return this.result(app, true);
              }
              throw new BusinessException(Errors.STATE);
            }
            await tx.$queryRaw`SELECT application_id FROM listing_applications WHERE application_id=${id} AND user_id=${userId} AND status='DRAFT' FOR UPDATE`;
            app = await tx.listingApplication.findUniqueOrThrow({
              where: { id },
            });
            this.assertDraft(app, new Date());
            if (
              app.lastSavedAt.getTime() !==
              new Date(dto.expectedLastSavedAt).getTime()
            ) {
              throw new BusinessException(Errors.CONFLICT);
            }
            await this.twoFactor.requireVerification(
              userId,
              TwoFactorAction.LISTING_SUBMIT,
              tx,
            );

            if (
              !app.draftData ||
              typeof app.draftData !== 'object' ||
              Array.isArray(app.draftData)
            ) {
              throw new BusinessException(Errors.VALIDATION);
            }
            const data = app.draftData as ListingDraftDataReqDto;
            const shapeIssues = validateSync(
              plainToInstance(ListingDraftDataReqDto, data),
              { whitelist: true, forbidNonWhitelisted: true },
            );
            if (shapeIssues.length) {
              throw new BusinessException(Errors.VALIDATION, undefined, {
                fields: shapeIssues.map((e) => ({
                  field: e.property,
                  message: Object.values(e.constraints ?? {}).join(' '),
                })),
              });
            }
            const fields: Array<{
              step: number;
              field: string;
              message: string;
            }> = [];
            for (const step of [1, 2, 3, 4]) {
              fields.push(
                ...(
                  await this.steps.validate(userId, step, data, new Date(), tx)
                ).map((issue) => ({ step, ...issue })),
              );
            }
            if (fields.length) {
              throw new BusinessException(Errors.VALIDATION, undefined, {
                fields,
              });
            }
            const attachments = await this.steps.getAttachments(
              userId,
              data,
              tx,
            );
            for (const collection of Object.values(attachments)) {
              if (collection) {
                await this.files.freezeSavedCollection(
                  userId,
                  collection.id,
                  tx,
                );
              }
            }
            const applicationNumber = await this.numbers.next(tx);
            const now = new Date();
            // 첨부/번호 잠금 대기 중 만료된 초안·인증·희망 일시는 접수하지 않고 전체 롤백한다.
            this.assertDraft(app, now);
            await this.twoFactor.requireVerification(
              userId,
              TwoFactorAction.LISTING_SUBMIT,
              tx,
            );
            const finalFields = [1, 2, 3, 4].flatMap((step) =>
              validateListingStepFields(step, data, now).map((issue) => ({
                step,
                ...issue,
              })),
            );
            if (finalFields.length) {
              throw new BusinessException(Errors.VALIDATION, undefined, {
                fields: finalFields,
              });
            }
            if (
              !applicationNumber.startsWith(`LST-${listingNumberDate(now)}-`)
            ) {
              throw new BusinessException(Errors.CONFLICT);
            }
            const updated = await tx.listingApplication.update({
              where: { id },
              data: {
                applicationNumber,
                submittedAt: now,
                status: Status.SUBMITTED,
              },
            });
            return this.result(updated, false);
          },
          { timeout: 15000 },
        );
      } catch (error) {
        const failure = error as {
          code?: string;
          meta?: { code?: string };
        };
        const retryable =
          failure?.code === 'P2034' ||
          (failure?.code === 'P2010' && failure.meta?.code === '40P01') ||
          // 이 트랜잭션에서 새로 쓰는 유일 값은 신청번호다. 어댑터별 target 표현에 의존하지 않는다.
          failure?.code === 'P2002';
        if (!retryable) {
          throw error;
        }
        if (attempt === 2) {
          throw new BusinessException(Errors.CONFLICT);
        }
      }
    }
    throw new BusinessException(Errors.CONFLICT);
  }

  private assertDraft(app: ListingApplication, now: Date) {
    if (app.status === Status.EXPIRED || app.expiresAt <= now) {
      throw new BusinessException(ApplicationErrors.EXPIRED);
    }
    if (
      app.status !== Status.DRAFT ||
      app.applicationNumber ||
      app.submittedAt ||
      app.deletedDate
    ) {
      throw new BusinessException(Errors.STATE);
    }
  }

  private async assertActive(tx: Prisma.TransactionClient, userId: number) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { userStatus: true },
    });
    if (user?.userStatus === UserStatus.LOCKED) {
      throw new BusinessException(AuthErrors.ACCOUNT_LOCKED);
    }
    if (user?.userStatus === UserStatus.BLOCKED) {
      throw new BusinessException(AuthErrors.ACCOUNT_BLOCKED);
    }
    if (user?.userStatus !== UserStatus.ACTIVE) {
      throw new BusinessException(AuthErrors.UNAUTHORIZED);
    }
  }

  private result(
    app: ListingApplication,
    replayed: boolean,
  ): ListingSubmissionResDto {
    return {
      applicationId: app.id,
      applicationNumber: app.applicationNumber!,
      submittedAt: app.submittedAt!,
      status: app.status,
      replayed,
    };
  }
}
