import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { GetFaqsResDto } from './dto/res/get-faqs-res.dto.js';
import { FaqCategoryFilter } from './faqs.constants.js';

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  /** FAQ를 노출 순서대로 조회한다. ALL이면 모든 카테고리다. */
  async getFaqs(category: FaqCategoryFilter): Promise<GetFaqsResDto> {
    const faqs = await this.prisma.faq.findMany({
      where: {
        isDeleted: false,
        ...(category === FaqCategoryFilter.ALL ? {} : { category }),
      },
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
