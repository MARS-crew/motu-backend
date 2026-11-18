import {
  effectiveReplyStatus,
  INQUIRY_REPLY_STALE_MS,
} from './inquiries-admin.constants.js';
import { InquiryReplyStatus as Status } from '../../generated/prisma/client.js';
describe('문의 발송 결과 판정', () => {
  const now = new Date('2026-11-18T10:00:00Z');
  it('진행 중 요청을 2분 경계부터 불명확으로 보여 주며 DB 상태를 변경하지 않는다', () => {
    const recent = {
      status: Status.SENDING,
      createDate: new Date(now.getTime() - INQUIRY_REPLY_STALE_MS + 1),
    };
    const stale = {
      status: Status.SENDING,
      createDate: new Date(now.getTime() - INQUIRY_REPLY_STALE_MS),
    };
    expect(effectiveReplyStatus(recent, now)).toBe(Status.SENDING);
    expect(effectiveReplyStatus(stale, now)).toBe(Status.UNKNOWN);
    expect(stale.status).toBe(Status.SENDING);
  });
  it.each([Status.ACCEPTED, Status.FAILED, Status.UNKNOWN, Status.SIMULATED])(
    '%s 결과는 경과 시간으로 바꾸지 않는다',
    (status) => {
      expect(
        effectiveReplyStatus(
          { status, createDate: new Date('2000-01-01') },
          now,
        ),
      ).toBe(status);
    },
  );
});
