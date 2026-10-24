import { ApiProperty } from '@nestjs/swagger';
import { FaqCategory } from '../../../../generated/prisma/client.js';

export class FaqItemResDto {
  @ApiProperty({ example: 1 })
  faqId: number;

  @ApiProperty({
    description:
      '카테고리 (TRADE 거래/주문, POINT 포인트/자산, ACCOUNT 계정/보안, LISTING 상장, ETC 기타)',
    enum: FaqCategory,
    example: FaqCategory.ACCOUNT,
  })
  category: FaqCategory;

  @ApiProperty({ example: '2차 보안은 무엇인가요?' })
  question: string;

  @ApiProperty({
    description: '답변 (줄바꿈 포함 텍스트)',
    example:
      '2차 보안은 새로운 기기 로그인, 연락처 변경 등 추가 인증이 필요한 기능을 한 번의 인증으로 처리하는 기능이에요.\n마이페이지에서 설정/해제가 가능해요.',
  })
  answer: string;
}

export class GetFaqsResDto {
  @ApiProperty({ type: [FaqItemResDto], description: '노출 순서대로' })
  items: FaqItemResDto[];
}
