import { createHmac } from 'node:crypto';

export const INQUIRY_TOKEN_TTL = 15 * 60;
export const INQUIRY_TOKEN_ISSUER = 'motu-inquiries';
export const INQUIRY_TOKEN_AUDIENCE = 'inquiries';

/** 일반 Access 토큰과 서명 키를 분리해 계정 해제 후에도 일반 API에 사용할 수 없게 한다. */
export function inquiryTokenSecret(accessSecret: string): string {
  return createHmac('sha256', accessSecret)
    .update('motu:inquiry-access:v1')
    .digest('hex');
}
