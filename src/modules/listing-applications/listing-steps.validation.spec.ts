import { validateListingStepFields as validate } from './listing-steps.validation.js';
import type { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';

describe('상장 신청 단계 검증', () => {
  const now = new Date('2026-10-25T01:00:00Z');
  const basic = {
    serviceName: '테스트 서비스',
    summary: '테스트 서비스 한 줄 소개입니다.',
    sectorCode: 1,
    mainImageCollectionId: 'image',
    operatorName: '운영사',
    managerName: '담당자',
    businessEmail: 'owner@example.com',
    contactPhone: '010-1234-5678',
  };
  const trading = {
    desiredPrice: '10000',
    totalIssuedQuantity: '100000',
    priceCalculationBasis: '희망 상장가 산정 근거',
    minOrderQuantity: '1',
    tickSize: '10',
  };
  it('기본정보와 선택 URL을 검증한다', () => {
    expect(validate(1, basic, now)).toEqual([]);
    expect(
      validate(1, { ...basic, officialUrl: 'http://example.com' }, now),
    ).toContainEqual(expect.objectContaining({ field: 'officialUrl' }));
  });
  it.each([
    'serviceName',
    'summary',
    'sectorCode',
    'mainImageCollectionId',
    'operatorName',
    'managerName',
    'businessEmail',
    'contactPhone',
  ] as const)('필수 %s 누락을 필드별로 안내한다', (field) => {
    expect(validate(1, { ...basic, [field]: null }, now)).toContainEqual(
      expect.objectContaining({ field }),
    );
  });
  it.each([
    { serviceName: '가' },
    { summary: '짧음' },
    { summary: '줄바꿈이 포함된\n서비스 소개입니다.' },
    { businessEmail: 'invalid' },
    { contactPhone: '123' },
  ])('기본정보 형식 오류 %j를 검출한다', (patch) => {
    expect(validate(1, { ...basic, ...patch }, now).length).toBeGreaterThan(0);
  });
  it('평가거래의 문서상 희망값을 허용한다', () => {
    expect(validate(2, trading, now)).toEqual([]);
    for (const value of ['1', '5', '10', '50', '100'])
      expect(
        validate(
          2,
          { ...trading, minOrderQuantity: value, tickSize: value },
          now,
        ),
      ).toEqual([]);
  });
  it.each(['0', '-1', '1.5', '1,000', 'NaN'])(
    '희망 가격 %s를 거부한다',
    (desiredPrice) => {
      expect(validate(2, { ...trading, desiredPrice }, now)).toContainEqual(
        expect.objectContaining({ field: 'desiredPrice' }),
      );
    },
  );
  it.each([
    '2026-10-25T09:00:00+09:00',
    '2027-02-30T10:00:00+09:00',
    '2026-10-26T24:00:00+09:00',
    '2026-10-26T10:00:00',
  ])('잘못된 희망 일시 %s를 거부한다', (desiredListingDate) => {
    expect(validate(2, { ...trading, desiredListingDate }, now)).toContainEqual(
      expect.objectContaining({ field: 'desiredListingDate' }),
    );
  });
  it('미래 일시는 허용하고 정책에 없는 상한을 강제하지 않는다', () => {
    expect(
      validate(
        2,
        { ...trading, desiredListingDate: '2026-10-26T09:00:00+09:00' },
        now,
      ),
    ).toEqual([]);
  });
  it('지표 전체의 필수화·증빙 최소 개수를 임의로 강제하지 않는다', () => {
    expect(validate(3, {}, now)).toEqual([]);
    expect(
      validate(
        4,
        { evidenceDescription: '증빙자료에 대한 상세 설명입니다.' },
        now,
      ),
    ).toEqual([]);
  });
  const metrics = {
    mau: '0',
    mauSource: '분석 도구',
    mauReferenceMonth: '2026-09',
    dau: '0',
    dauSource: '분석 도구',
    dauReferenceDate: '2026-09-30',
    revenue: '0',
    revenueStartDate: '2025-01-01',
    revenueEndDate: '2025-12-31',
    revenueSource: '매출 보고서',
    revenueExtractDate: '2026-01-01',
    transactionVolume: '0',
    transactionVolumeBasis: 'LAST_12_MONTHS',
    metricsStartDate: '2025-10-01',
    metricsEndDate: '2026-09-30',
    transactionVolumeSource: '결제 시스템',
    transactionVolumeExtractDate: '2026-10-01',
  };
  it('입력한 지표의 0과 기간·출처를 검증한다', () => {
    expect(validate(3, metrics, now)).toEqual([]);
  });
  it.each([
    [{ mau: '-1' }, 'mau'],
    [{ mauSource: null }, 'mauSource'],
    [{ mauReferenceMonth: '2026-13' }, 'mauReferenceMonth'],
    [{ dauReferenceDate: '2026-02-30' }, 'dauReferenceDate'],
    [{ revenueStartDate: '2026-01-02' }, 'revenueEndDate'],
    [{ metricsStartDate: '2025-09-01' }, 'metricsEndDate'],
    [
      { transactionVolumeExtractDate: '2026-09-01' },
      'transactionVolumeExtractDate',
    ],
    [{ transactionVolumeBasis: 'UNKNOWN' }, 'transactionVolumeBasis'],
    [{ revenueEndDate: '2027-01-01' }, 'revenueEndDate'],
  ] as [Partial<ListingDraftDataReqDto>, string][])(
    '지표 오류 %j를 필드 %s에 표시한다',
    (patch, field) => {
      expect(validate(3, { ...metrics, ...patch }, now)).toContainEqual(
        expect.objectContaining({ field }),
      );
    },
  );
  it.each(['', '짧음', '가'.repeat(501)])(
    '자료 설명 길이를 확인한다',
    (evidenceDescription) => {
      expect(validate(4, { evidenceDescription }, now)).toContainEqual(
        expect.objectContaining({ field: 'evidenceDescription' }),
      );
    },
  );
});
