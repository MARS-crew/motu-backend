import { createHmac, randomBytes } from 'node:crypto';

export const INQUIRY_TOKEN_TTL = 15 * 60;
export const INQUIRY_MAX_FAILURES = 5;
export const INQUIRY_BLOCK_MS = 15 * 60 * 1000;
export const INQUIRY_TITLE_MAX_LENGTH = 100;
export const INQUIRY_CONTENT_MAX_LENGTH = 5000;
export const INQUIRY_TOKEN_ISSUER = 'motu-inquiries';
export const INQUIRY_TOKEN_AUDIENCE = 'inquiries';

/** 본인 확인·비로그인 접수에서 공통으로 쓰는 한국 시간 기준 문의번호. */
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

/** 일반 Access 토큰과 서명 키를 분리해 계정 해제 후에도 일반 API에 사용할 수 없게 한다. */
export function inquiryTokenSecret(accessSecret: string): string {
  return createHmac('sha256', accessSecret)
    .update('motu:inquiry-access:v1')
    .digest('hex');
}
