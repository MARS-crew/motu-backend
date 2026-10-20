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

  it('Brevo가 실패 응답을 주면 에러를 던진다', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"code":"unauthorized"}', { status: 401 }),
    );

    await expect(sender.send(mail)).rejects.toThrow(
      'Brevo 메일 발송 실패: 401',
    );
  });
});
