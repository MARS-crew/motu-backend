import { BrevoMailSender } from './brevo-mail-sender.js';

describe('BrevoMailSender', () => {
  const fetchMock = vi.fn();
  const sender = new BrevoMailSender({
    apiKey: 'test-api-key',
    fromEmail: 'motu@example.com',
    fromName: 'MOTU',
  });
  const mail = {
    to: 'name@example.com',
    subject: '[MOTU] 제목',
    text: '본문',
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Brevo API로 발신자, 수신자, 제목, 본문을 보낸다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 201 }));

    await sender.send(mail);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'api-key': 'test-api-key' });
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: 'motu@example.com', name: 'MOTU' },
      to: [{ email: 'name@example.com' }],
      subject: '[MOTU] 제목',
      textContent: '본문',
    });
  });

  it('Brevo가 실패 응답을 주면 503 MAIL_SEND_FAILED로 알린다', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"code":"unauthorized"}', { status: 401 }),
    );

    await expect(sender.send(mail)).rejects.toMatchObject({
      response: { code: 'MAIL_SEND_FAILED' },
      status: 503,
    });
  });

  it('요청 자체가 실패해도(시간 초과 등) 503 MAIL_SEND_FAILED로 알린다', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted'));

    await expect(sender.send(mail)).rejects.toMatchObject({
      response: { code: 'MAIL_SEND_FAILED' },
    });
  });
  it('공급자 접수 ID를 반환하고 실제 수신 확인과 구분한다', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ messageId: '<reply-1@brevo.test>' }), {
        status: 201,
      }),
    );
    await expect(sender.sendTracked(mail)).resolves.toEqual({
      mode: 'BREVO',
      messageId: '<reply-1@brevo.test>',
    });
  });
  it.each([400, 401, 403, 422, 429])(
    'HTTP %i 거절은 확정 실패로 분류한다',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('{}', { status }));
      await expect(sender.sendTracked(mail)).rejects.toMatchObject({
        outcome: 'FAILED',
        status: 503,
      });
    },
  );
  it.each([408, 500, 503])(
    'HTTP %i는 발송 여부 불명확으로 분류한다',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('{}', { status }));
      await expect(sender.sendTracked(mail)).rejects.toMatchObject({
        outcome: 'UNKNOWN',
      });
    },
  );
  it('네트워크 중단과 응답 유실은 불명확 결과다', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(sender.sendTracked(mail)).rejects.toMatchObject({
      outcome: 'UNKNOWN',
    });
  });
});
