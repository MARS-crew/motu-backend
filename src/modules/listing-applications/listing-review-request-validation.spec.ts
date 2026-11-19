import { ValidationPipe } from '@nestjs/common';
import {
  ApproveListingReqDto,
  ExtendListingRevisionDeadlineReqDto,
  RequestListingRevisionReqDto,
} from './dto/req/review-listing-req.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const approval = {
  finalPrice: '10000',
  totalIssuedQuantity: '1000',
  listingDate: '2026-12-01',
  tradingStartAt: '2026-12-01T09:00:00+09:00',
  reason: '검토 완료',
};
const transform = (
  value: unknown,
  metatype:
    | typeof ApproveListingReqDto
    | typeof RequestListingRevisionReqDto
    | typeof ExtendListingRevisionDeadlineReqDto,
) => pipe.transform(value, { type: 'body', metatype });

describe('관리자 심사 요청 검증', () => {
  it('가격 조정도 처리 사유 하나만 입력할 수 있다', async () => {
    await expect(
      transform({ ...approval, finalPrice: '11000' }, ApproveListingReqDto),
    ).resolves.toMatchObject({ reason: '검토 완료', finalPrice: '11000' });
  });
  it.each([
    { finalPrice: 10000 },
    { finalPrice: '0' },
    { finalPrice: '-1' },
    { totalIssuedQuantity: '1.5' },
    { tradingStartAt: '2026-12-01T09:00:00' },
    { tradingStartAt: '2026-02-30T09:00:00Z' },
    { reason: '   ' },
    { priceAdjustmentReason: null },
    { status: 'APPROVED' },
  ])('잘못된 승인 필드와 임의 상태 변경을 거부한다(%j)', async (patch) => {
    await expect(
      transform({ ...approval, ...patch }, ApproveListingReqDto),
    ).rejects.toThrow();
  });
  it('가격과 수량을 문자열로 유지하고 사유의 앞뒤 공백을 제거한다', async () => {
    const dto = await transform(
      {
        ...approval,
        reason: '  검토 완료  ',
        priceAdjustmentReason: '  가격 조정  ',
      },
      ApproveListingReqDto,
    );
    expect(dto.finalPrice).toBe('10000');
    expect(dto.reason).toBe('검토 완료');
    expect(dto.priceAdjustmentReason).toBe('가격 조정');
  });
  it.each([
    [],
    ['  '],
    ['증빙', '증빙'],
    ['x'.repeat(101)],
    Array.from({ length: 11 }, (_, i) => String(i)),
  ])('잘못된 보완 항목을 거부한다(%j)', async (requestItems) => {
    await expect(
      transform(
        {
          requestItems,
          requestContent: '보완 내용',
          deadline: '2026-12-07T23:59:59+09:00',
        },
        RequestListingRevisionReqDto,
      ),
    ).rejects.toThrow();
  });
  it('보완 내용이 처리 사유를 겸하며 별도 reason을 요구하지 않는다', async () => {
    await expect(
      transform(
        {
          requestItems: ['  증빙자료 '],
          requestContent: '  보완 내용  ',
          deadline: '2026-12-07T23:59:59+09:00',
        },
        RequestListingRevisionReqDto,
      ),
    ).resolves.toMatchObject({
      requestItems: ['증빙자료'],
      requestContent: '보완 내용',
    });
  });
  it('연장에는 사유와 시간대가 모두 필요하다', async () => {
    await expect(
      transform(
        { deadline: '2026-12-07T23:59:59+09:00' },
        ExtendListingRevisionDeadlineReqDto,
      ),
    ).rejects.toThrow();
    await expect(
      transform(
        { deadline: '2026-12-07T23:59:59', reason: '연장' },
        ExtendListingRevisionDeadlineReqDto,
      ),
    ).rejects.toThrow();
  });
});
