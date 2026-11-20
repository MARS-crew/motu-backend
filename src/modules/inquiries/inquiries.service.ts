import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma, UserStatus } from '../../generated/prisma/client.js';
import { InquiryErrors as Errors } from './inquiries.errors.js';

/** 이전 회원 연결 문의의 읽기 전용 조회. 신규 접수는 AccountInquiriesService만 사용한다. */
@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

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
