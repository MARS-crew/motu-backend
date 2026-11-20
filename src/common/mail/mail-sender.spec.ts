import { Logger } from '@nestjs/common';
import { MailSender } from './mail-sender.js';
import { ConsoleMailSender } from './console-mail-sender.js';
describe('문의 메일 추적 계약', () => {
  const mail = {
    to: 'local@motu.test',
    subject: '문의 답변',
    text: '테스트 답변',
  };
  afterEach(() => vi.restoreAllMocks());
  it('추적을 지원하지 않는 발송기는 실제 전송을 실행하거나 성공으로 표시하지 않는다', async () => {
    class Legacy extends MailSender {
      send = vi.fn().mockResolvedValue(undefined);
    }
    const sender = new Legacy();
    await expect(sender.sendTracked(mail)).rejects.toMatchObject({
      outcome: 'FAILED',
      status: 503,
    });
    expect(sender.send).not.toHaveBeenCalled();
  });
  it('콘솔 발송을 실제 공급자 접수와 구분한다', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    await expect(new ConsoleMailSender().sendTracked(mail)).resolves.toEqual({
      mode: 'CONSOLE',
      messageId: null,
    });
    expect(log).toHaveBeenCalledOnce();
  });
});
