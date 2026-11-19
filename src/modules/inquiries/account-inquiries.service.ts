import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  InquirySource,
  InquiryType,
  Prisma,
} from '../../generated/prisma/client.js';
import type { CreateAccountInquiryReqDto } from './dto/req/create-account-inquiry-req.dto.js';
import { inquiryCode } from './inquiries.constants.js';
import { InquirySubmissionLimiter } from './inquiry-submission-limiter.service.js';

const titles: Record<InquiryType, string> = {
  LOGIN_FAILED_LOCKED: '계정 잠금 문의',
  SUSPENDED: '계정 정지 문의',
  PHONE_UNAVAILABLE: '등록 휴대폰 사용 불가 문의',
};

@Injectable()
export class AccountInquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: InquirySubmissionLimiter,
  ) {}

  async create(dto: CreateAccountInquiryReqDto) {
    // 회원 조회·연결·비밀번호 확인·계정 상태 변경을 수행하지 않는다.
    await this.limiter.cleanupExpired();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const receipt = await this.prisma.$transaction(async (tx) => {
          await this.limiter.consumeEmail(tx, dto.replyEmail);
          return tx.inquiry.create({
            data: {
              source: InquirySource.PUBLIC_ACCOUNT_AUTH,
              userId: null,
              inquiryCode: inquiryCode(),
              inquiryType: dto.inquiryType,
              title: titles[dto.inquiryType],
              replyEmail: dto.replyEmail,
              content: dto.content,
            },
            select: { inquiryCode: true, status: true, createDate: true },
          });
        });
        return {
          ...receipt,
          message: '문의가 접수되었습니다. 입력하신 이메일로 답변드리겠습니다.',
        };
      } catch (error) {
        // 번호 충돌로 롤백된 경우에만 새 번호로 재시도한다. 회신 주소별 제한도 함께 롤백된다.
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
}
