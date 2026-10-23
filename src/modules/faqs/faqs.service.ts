import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { FaqCategory } from '../../generated/prisma/client.js';
import { GetFaqsResDto } from './dto/res/get-faqs-res.dto.js';

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  /** FAQ를 노출 순서대로 조회한다. 카테고리를 넘기지 않으면 전체다. */
  async getFaqs(category?: FaqCategory): Promise<GetFaqsResDto> {
    const faqs = await this.prisma.faq.findMany({
      where: { isDeleted: false, ...(category ? { category } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return {
      items: faqs.map(({ id, category, question, answer }) => ({
        faqId: id,
        category,
        question,
        answer,
      })),
    };
  }
}
