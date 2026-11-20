import { createHmac, randomBytes } from 'node:crypto';

export const INQUIRY_TOKEN_TTL = 15 * 60;
export const INQUIRY_CONTENT_MAX_LENGTH = 5000;
export const INQUIRY_TOKEN_ISSUER = 'motu-inquiries';
export const INQUIRY_TOKEN_AUDIENCE = 'inquiries';

/** 공개 접수에서 쓰는 한국 시간 기준 문의번호. */
export function inquiryCode(): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replaceAll('-', '');
  return `INQ-${date}-${randomBytes(6).toString('hex').toUpperCase()}`;
}

/** 종료 전에 발급된 문의 토큰의 읽기 전용 검증에만 사용한다. 신규 발급은 하지 않는다. */
export function inquiryTokenSecret(accessSecret: string): string {
  return createHmac('sha256', accessSecret)
    .update('motu:inquiry-access:v1')
    .digest('hex');
}
