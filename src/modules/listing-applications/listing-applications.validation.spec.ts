import { normalizeListingUrl } from './listing-applications.validation.js';

describe('상장 공식 URL 정규화', () => {
  it.each([undefined, null, '', '  '])(
    '빈 URL %s은 예약하지 않는다',
    (value) => {
      expect(normalizeListingUrl(value)).toBeNull();
    },
  );
  it('호스트·포트·후행 슬래시·fragment를 정규화한다', () => {
    expect(
      normalizeListingUrl(' HTTPS://EXAMPLE.COM:443/service/#about '),
    ).toBe('https://example.com/service');
  });
  it('동일한 쿼리 키 순서를 정규화한다', () => {
    expect(normalizeListingUrl('https://example.com/?b=2&a=1')).toBe(
      normalizeListingUrl('https://example.com?a=1&b=2'),
    );
  });
  it('서로 다른 경로·쿼리·www 주소는 구분한다', () => {
    expect(normalizeListingUrl('https://example.com/App')).not.toBe(
      normalizeListingUrl('https://example.com/app'),
    );
    expect(normalizeListingUrl('https://example.com?a=1')).not.toBe(
      normalizeListingUrl('https://example.com?a=2'),
    );
    expect(normalizeListingUrl('https://www.example.com')).not.toBe(
      normalizeListingUrl('https://example.com'),
    );
  });
  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'https://',
    'not-url',
    'https://user:pass@example.com',
    'https://example.com/' + 'a'.repeat(2048),
  ])('%s은 URL 전용 오류로 거부한다', (value) => {
    expect(() => normalizeListingUrl(value)).toThrow(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'LISTING_INVALID_URL' }),
      }),
    );
  });
});
