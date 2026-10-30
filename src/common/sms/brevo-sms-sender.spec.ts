import { BrevoSmsSender, toInternational } from './brevo-sms-sender.js';

describe('BrevoSmsSender', () => {
  const fetchMock = vi.fn();
  const sender = new BrevoSmsSender({ apiKey: 'test-api-key', sender: 'MOTU' });
  const sms = { to: '01012344821', text: '[MOTU] 인증번호 [123456]' };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Brevo API로 국가번호를 붙인 번호와 한글 본문을 보낸다', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"messageId":1}', { status: 201 }),
    );

    await sender.send(sms);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/transactionalSMS/send');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'api-key': 'test-api-key' });
    expect(JSON.parse(init.body as string)).toEqual({
      sender: 'MOTU',
      recipient: '821012344821',
      content: '[MOTU] 인증번호 [123456]',
      type: 'transactional',
      unicodeEnabled: true,
    });
  });

  it('Brevo가 실패 응답을 주면(크레딧 부족 등) 503 SMS_SEND_FAILED로 알린다', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"code":"not_enough_credits"}', { status: 400 }),
    );

    await expect(sender.send(sms)).rejects.toMatchObject({
      response: { code: 'SMS_SEND_FAILED' },
      status: 503,
    });
  });

  it('요청 자체가 실패해도 503 SMS_SEND_FAILED로 알린다', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted'));

    await expect(sender.send(sms)).rejects.toMatchObject({
      response: { code: 'SMS_SEND_FAILED' },
    });
  });

  it('국내 번호를 국제 형식으로 바꾼다', () => {
    expect(toInternational('01012345678')).toBe('821012345678');
    expect(toInternational('0111234567')).toBe('82111234567');
  });
});
