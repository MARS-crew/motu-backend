/** 재설정 토큰 형식. 발급할 때 base64url로 만든다. */
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * 재설정 메일 링크를 열었을 때 내려주는 페이지.
 * 앱 딥링크로 바로 이동하고, 브라우저가 자동 이동을 막으면 [앱에서 열기] 버튼으로 이동한다.
 * 토큰 형식이 맞지 않으면 앱으로 넘기지 않고 안내만 한다.
 * @returns 응답 상태 코드와 HTML
 */
export function passwordResetOpenPage(
  appUrl: string,
  token: unknown,
): { status: number; html: string } {
  if (typeof token !== 'string' || !RESET_TOKEN_PATTERN.test(token)) {
    return {
      status: 400,
      html: page(
        '링크가 올바르지 않습니다',
        '<p>비밀번호 재설정 링크가 올바르지 않습니다. 앱에서 비밀번호 재설정을 다시 요청해 주세요.</p>',
      ),
    };
  }

  const url = new URL(appUrl);
  url.searchParams.set('token', token);
  const href = escapeHtml(url.toString());
  return {
    status: 200,
    html: page(
      'MOTU 비밀번호 재설정',
      `<p>MOTU 앱에서 비밀번호 재설정 화면을 엽니다.</p>
<p><a class="button" href="${href}">앱에서 열기</a></p>
<p class="hint">앱이 열리지 않으면 MOTU 앱이 설치되어 있는지 확인해 주세요. 링크는 30분 동안 한 번만 쓸 수 있습니다.</p>
<script>window.location.replace(${JSON.stringify(url.toString()).replace(/</g, '\\u003c')});</script>`,
    ),
  };
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;margin:0;padding:48px 24px;text-align:center;color:#1f2937;background:#fff}
h1{font-size:20px;margin:0 0 16px}
p{font-size:15px;line-height:1.6;margin:0 0 16px}
.button{display:inline-block;padding:12px 28px;border-radius:8px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600}
.hint{font-size:13px;color:#6b7280}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
}
