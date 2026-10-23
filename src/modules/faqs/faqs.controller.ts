import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { GetFaqsReqDto } from './dto/req/get-faqs-req.dto.js';
import { GetFaqsResDto } from './dto/res/get-faqs-res.dto.js';
import { FaqsService } from './faqs.service.js';

@ApiTags('FAQs')
@Controller('faqs')
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'FAQ 목록',
    description:
      '카테고리로 거르고, 비우면 전체다. 건수가 적어 페이지 없이 한 번에 내려준다.',
  })
  @ApiOkResponse({ type: GetFaqsResDto })
  getFaqs(@Query() query: GetFaqsReqDto): Promise<GetFaqsResDto> {
    return this.faqsService.getFaqs(query.category);
  }
}
