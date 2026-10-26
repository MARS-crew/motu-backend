import { isEmail } from 'class-validator';
import type { ListingDraftDataReqDto } from './dto/req/listing-draft-data-req.dto.js';
import { normalizeListingUrl } from './listing-applications.validation.js';

export interface ListingFieldIssue {
  field: string;
  message: string;
}

function validCalendarDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export const LISTING_STEP_FIELDS: Record<
  number,
  readonly (keyof ListingDraftDataReqDto)[]
> = {
  1: [
    'serviceName',
    'summary',
    'description',
    'sectorCode',
    'officialUrl',
    'operatorName',
    'managerName',
    'businessEmail',
    'contactPhone',
    'logoCollectionId',
    'mainImageCollectionId',
  ],
  2: [
    'desiredPrice',
    'totalIssuedQuantity',
    'minOrderQuantity',
    'tickSize',
    'priceCalculationBasis',
    'desiredListingDate',
  ],
  3: [
    'mau',
    'mauSource',
    'mauReferenceMonth',
    'dau',
    'dauSource',
    'dauReferenceDate',
    'revenue',
    'revenueStartDate',
    'revenueEndDate',
    'revenueSource',
    'revenueExtractDate',
    'transactionVolume',
    'metricsStartDate',
    'metricsEndDate',
    'transactionVolumeBasis',
    'transactionVolumeSource',
    'transactionVolumeExtractDate',
  ],
  4: ['evidenceCollectionId', 'evidenceDescription'],
};

export function validateListingStepFields(
  step: number,
  data: ListingDraftDataReqDto,
  now = new Date(),
): ListingFieldIssue[] {
  const issues: ListingFieldIssue[] = [];
  const add = (field: keyof ListingDraftDataReqDto, message: string) =>
    issues.push({ field, message });
  const text = (field: keyof ListingDraftDataReqDto) =>
    typeof data[field] === 'string' ? (data[field] as string).trim() : '';
  const required = (field: keyof ListingDraftDataReqDto, label: string) => {
    if (!text(field)) {
      add(field, `${label}을(를) 입력해 주세요.`);
      return false;
    }
    return true;
  };
  const integer = (
    field: keyof ListingDraftDataReqDto,
    label: string,
    positive = false,
  ) => {
    if (!required(field, label)) return;
    const value = text(field);
    if (!/^\d+$/.test(value) || (positive && BigInt(value) === 0n))
      add(
        field,
        `${label}은(는) ${positive ? '0보다 큰' : '0 이상의'} 정수로 입력해 주세요.`,
      );
  };
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
  }).format(now);
  const date = (
    field: keyof ListingDraftDataReqDto,
    label: string,
  ): string | null => {
    if (!text(field)) return null;
    const value = text(field);
    if (!validCalendarDate(value) || value > today) {
      add(
        field,
        `${label}은(는) 오늘까지의 올바른 날짜(YYYY-MM-DD)로 입력해 주세요.`,
      );
      return null;
    }
    return value;
  };
  const period = (
    startField: keyof ListingDraftDataReqDto,
    endField: keyof ListingDraftDataReqDto,
    extractionField: keyof ListingDraftDataReqDto,
  ) => {
    const start = date(startField, '집계 시작일');
    const end = date(endField, '집계 종료일');
    const extraction = date(extractionField, '추출일');
    if (start && end) {
      if (start > end)
        add(endField, '집계 종료일은 시작일보다 빠를 수 없습니다.');
      const anniversary = new Date(start);
      anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
      if (new Date(end) >= anniversary)
        add(endField, '집계 기간은 12개월을 초과할 수 없습니다.');
    }
    if (end && extraction && extraction < end)
      add(extractionField, '추출일은 집계 종료일 이후로 입력해 주세요.');
  };

  if (step === 1) {
    if (
      required('serviceName', '서비스명') &&
      (text('serviceName').length < 2 || text('serviceName').length > 30)
    )
      add('serviceName', '서비스명은 2자 이상 30자 이하로 입력해 주세요.');
    if (
      required('summary', '한 줄 소개') &&
      (text('summary').length < 10 || text('summary').length > 60)
    )
      add('summary', '한 줄 소개는 10자 이상 60자 이하로 입력해 주세요.');
    for (const field of ['serviceName', 'summary'] as const)
      if (/[\r\n]/.test(text(field))) add(field, '줄바꿈 없이 입력해 주세요.');
    if (!Number.isSafeInteger(data.sectorCode) || (data.sectorCode ?? 0) < 1)
      add('sectorCode', '카테고리를 선택해 주세요.');
    required('operatorName', '운영사명');
    required('managerName', '담당자명');
    if (
      required('businessEmail', '업무용 이메일') &&
      !isEmail(text('businessEmail'))
    )
      add('businessEmail', '올바른 업무용 이메일을 입력해 주세요.');
    if (
      required('contactPhone', '담당자 연락처') &&
      !/^01[016789]\d{7,8}$/.test(text('contactPhone').replace(/-/g, ''))
    )
      add('contactPhone', '올바른 휴대폰 연락처를 입력해 주세요.');
    if (!text('mainImageCollectionId'))
      add('mainImageCollectionId', '저장 완료된 대표 이미지를 선택해 주세요.');
    if (text('officialUrl')) {
      try {
        normalizeListingUrl(text('officialUrl'));
      } catch {
        add(
          'officialUrl',
          'https://로 시작하는 올바른 공식 URL을 입력해 주세요.',
        );
      }
    }
  }
  if (step === 2) {
    integer('desiredPrice', '희망 상장가', true);
    integer('totalIssuedQuantity', '총 발행 수량', true);
    required('priceCalculationBasis', '가격 산정 근거');
    for (const field of ['minOrderQuantity', 'tickSize'] as const)
      if (text(field) && !['1', '5', '10', '50', '100'].includes(text(field)))
        add(field, '1, 5, 10, 50, 100 중에서 선택해 주세요.');
    const value = text('desiredListingDate');
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) ||
        !validCalendarDate(value.slice(0, 10)) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).getTime() <= now.getTime())
    )
      add('desiredListingDate', '시간대가 포함된 미래 일시로 입력해 주세요.');
  }
  if (step === 3) {
    // 지표와 보조 항목은 각각 선택 입력이다. 기본값이나 일부 입력으로 다른 항목을 필수화하지 않는다.
    for (const [field, label] of [
      ['mau', 'MAU'],
      ['dau', 'DAU'],
      ['revenue', '연간 매출'],
      ['transactionVolume', '거래액'],
    ] as const)
      if (text(field)) integer(field, label);
    if (
      text('mauReferenceMonth') &&
      (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(text('mauReferenceMonth')) ||
        text('mauReferenceMonth') > today.slice(0, 7))
    )
      add(
        'mauReferenceMonth',
        '오늘까지의 올바른 기준월(YYYY-MM)로 입력해 주세요.',
      );
    date('dauReferenceDate', 'DAU 기준일');
    period('revenueStartDate', 'revenueEndDate', 'revenueExtractDate');
    period(
      'metricsStartDate',
      'metricsEndDate',
      'transactionVolumeExtractDate',
    );
    if (
      text('transactionVolumeBasis') &&
      !['LAST_12_MONTHS', 'SINCE_LAUNCH'].includes(
        text('transactionVolumeBasis'),
      )
    )
      add(
        'transactionVolumeBasis',
        'LAST_12_MONTHS 또는 SINCE_LAUNCH를 선택해 주세요.',
      );
  }
  if (
    step === 4 &&
    (text('evidenceDescription').length < 10 ||
      text('evidenceDescription').length > 500)
  )
    add(
      'evidenceDescription',
      '자료 설명은 10자 이상 500자 이하로 입력해 주세요.',
    );
  return issues;
}
