import { ExecutionContext } from '@nestjs/common';
import { InquirySessionRateLimitGuard } from './inquiry-session-rate-limit.guard.js';

describe('InquirySessionRateLimitGuard', () => {
  const context = (loginId: string) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ body: { loginId } }) }),
    }) as unknown as ExecutionContext;
  afterEach(() => vi.useRealTimers());

  it('계정당 1분에 10회까지 허용하고 11회부터 차단한다', () => {
    const guard = new InquirySessionRateLimitGuard();
    for (let i = 0; i < 10; i++)
      expect(guard.canActivate(context('locked'))).toBe(true);
    expect(() => guard.canActivate(context('locked'))).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'INQUIRY_TOO_MANY_ATTEMPTS',
        }),
      }),
    );
    expect(guard.canActivate(context('other'))).toBe(true);
  });

  it('1분 뒤 다시 허용한다', () => {
    vi.useFakeTimers();
    const guard = new InquirySessionRateLimitGuard();
    for (let i = 0; i < 10; i++) guard.canActivate(context('locked'));
    vi.advanceTimersByTime(60000);
    expect(guard.canActivate(context('locked'))).toBe(true);
  });
});
