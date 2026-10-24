import { FaqCategory } from '../../generated/prisma/client.js';

/**
 * FAQ 필터. 화면의 6개 필터(전체, 거래/주문, 포인트/자산, 계정/보안, 상장, 기타)와 같다.
 * 전체(ALL)는 필터 값일 뿐이라 FAQ 카테고리로 저장하지 않는다.
 */
export const FaqCategoryFilter = {
  ALL: 'ALL',
  ...FaqCategory,
} as const;

export type FaqCategoryFilter =
  (typeof FaqCategoryFilter)[keyof typeof FaqCategoryFilter];
