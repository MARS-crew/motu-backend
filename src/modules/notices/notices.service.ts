import { Injectable } from '@nestjs/common';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Notice, Prisma } from '../../generated/prisma/client.js';
import { GetLatestNoticeResDto } from './dto/res/get-latest-notice-res.dto.js';
import { GetNoticeResDto } from './dto/res/get-notice-res.dto.js';
import {
  GetNoticesResDto,
  NoticeItemResDto,
} from './dto/res/get-notices-res.dto.js';
import { NoticeErrors } from './notices.errors.js';

@Injectable()
export class NoticesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 게시 중인 공지를 중요 공지 먼저, 그다음 최근 게시순으로 조회한다. */
  async getNotices(page: number, size: number): Promise<GetNoticesResDto> {
    const where = this.postedWhere(new Date());
    const [notices, totalCount] = await this.prisma.$transaction([
      this.prisma.notice.findMany({
        where,
        orderBy: [
          { isImportant: 'desc' },
          { postStartDate: 'desc' },
          { id: 'desc' },
        ],
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.notice.count({ where }),
    ]);

    return {
      items: notices.map((notice) => this.toItem(notice)),
      page,
      size,
      totalCount,
    };
  }

  /** 홈 화면용. 중요 공지 여부와 상관없이 가장 최근에 게시된 공지 하나를 조회한다. */
  async getLatestNotice(): Promise<GetLatestNoticeResDto> {
    const notice = await this.prisma.notice.findFirst({
      where: this.postedWhere(new Date()),
      orderBy: [{ postStartDate: 'desc' }, { id: 'desc' }],
    });
    return { notice: notice ? this.toItem(notice) : null };
  }

  async getNotice(noticeId: number): Promise<GetNoticeResDto> {
    const notice = await this.prisma.notice.findFirst({
      where: { AND: [{ id: noticeId }, this.postedWhere(new Date())] },
    });
    if (!notice) {
      throw new BusinessException(NoticeErrors.NOT_FOUND);
    }
    return Object.assign(this.toItem(notice), { content: notice.content });
  }

  /**
   * 게시 기간 안에 있는 공지 조건. 게시 시작·종료를 배치로 바꾸지 않고 조회할 때 거른다.
   */
  private postedWhere(now: Date): Prisma.NoticeWhereInput {
    return {
      isDeleted: false,
      postStartDate: { lte: now },
      OR: [{ postEndDate: null }, { postEndDate: { gt: now } }],
    };
  }

  private toItem(notice: Notice): NoticeItemResDto {
    return {
      noticeId: notice.id,
      type: notice.type,
      title: notice.title,
      isImportant: notice.isImportant,
      postDate: notice.postStartDate,
    };
  }
}
