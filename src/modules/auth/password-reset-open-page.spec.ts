import { passwordResetOpenPage } from './password-reset-open-page.js';

describe('passwordResetOpenPage', () => {
  const APP_URL = 'motu://new-password';

  it('토큰을 붙인 앱 딥링크로 이동하고 버튼도 보여준다', () => {
    const { status, html } = passwordResetOpenPage(APP_URL, 'abc_DEF-123');

    expect(status).toBe(200);
    expect(html).toContain('href="motu://new-password?token=abc_DEF-123"');
    expect(html).toContain(
      'window.location.replace("motu://new-password?token=abc_DEF-123")',
    );
  });

  it('앱 주소에 이미 쿼리가 있어도 토큰을 덧붙인다', () => {
    const { html } = passwordResetOpenPage(
      'motu://new-password?from=mail',
      'abc',
    );

    expect(html).toContain('motu://new-password?from=mail&amp;token=abc');
  });

  it.each([
    ['없음', undefined],
    ['배열', ['a', 'b']],
    ['허용하지 않는 문자', '"><script>alert(1)</script>'],
    ['너무 긺', 'a'.repeat(201)],
  ])('토큰 형식이 맞지 않으면(%s) 앱으로 넘기지 않는다', (_, token) => {
    const { status, html } = passwordResetOpenPage(APP_URL, token);

    expect(status).toBe(400);
    expect(html).not.toContain('motu://');
    expect(html).not.toContain('<script>alert');
  });
});
