import { ValidationPipe } from '@nestjs/common';
import {
  SaveInquiryReplyDraftReqDto,
  SendInquiryReplyReqDto,
} from './dto/req/reply-inquiry-req.dto.js';
import {
  GetAdminInquiriesReqDto,
  GetAdminInquiryDetailReqDto,
} from './dto/req/get-admin-inquiries-req.dto.js';
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const body = {
  requestId: '7f52b4a4-211c-4c04-9317-1b355dc045bc',
  expectedDraftVersion: 1,
};
const send = (patch: Record<string, unknown>) =>
  pipe.transform(
    { ...body, ...patch },
    { type: 'body', metatype: SendInquiryReplyReqDto },
  );
describe('관리자 문의 요청 검증', () => {
  it.each([
    { requestId: 'bad' },
    { expectedDraftVersion: 0 },
    { expectedDraftVersion: '1' },
    { expectedDraftVersion: 1.5 },
    { confirmResend: 'true' },
    { confirmResend: null },
    { confirmResend: true },
    { confirmResend: true, retryReason: '  ' },
    { toEmail: 'redirect@example.com' },
    { adminId: 99 },
  ])('잘못된 발송 요청과 수신자·담당자 주입을 거부한다 (%j)', async (patch) => {
    await expect(send(patch)).rejects.toThrow();
  });
  it('일반 발송은 확인 필드 없이 허용하고 명시적 재발송은 사유를 정규화한다', async () => {
    await expect(send({})).resolves.toMatchObject(body);
    await expect(
      send({
        confirmResend: true,
        retryReason: '  공급자 기록 확인 후 재발송  ',
      }),
    ).resolves.toMatchObject({ retryReason: '공급자 기록 확인 후 재발송' });
  });
  it.each([
    { expectedVersion: -1, replyText: '답변' },
    { expectedVersion: 0, replyText: '   ' },
    { expectedVersion: 0, replyText: '가'.repeat(5001) },
    { expectedVersion: 0, replyText: 123 },
    { expectedVersion: 0, replyText: '답변', status: 'APPROVED' },
  ])('잘못된 초안 저장을 거부한다 (%j)', async (dto) => {
    await expect(
      pipe.transform(dto, {
        type: 'body',
        metatype: SaveInquiryReplyDraftReqDto,
      }),
    ).rejects.toThrow();
  });
  it('초안의 앞뒤 공백만 제거하고 줄바꿈을 보존한다', async () => {
    await expect(
      pipe.transform(
        { expectedVersion: 0, replyText: '  첫 줄\n둘째 줄  ' },
        { type: 'body', metatype: SaveInquiryReplyDraftReqDto },
      ),
    ).resolves.toMatchObject({ replyText: '첫 줄\n둘째 줄' });
  });
  it('목록과 발송 이력의 페이지는 숫자로 변환한다', async () => {
    await expect(
      pipe.transform(
        { page: '2', size: '10', keyword: ' INQ-1 ' },
        { type: 'query', metatype: GetAdminInquiriesReqDto },
      ),
    ).resolves.toMatchObject({ page: 2, size: 10, keyword: 'INQ-1' });
    await expect(
      pipe.transform(
        { attemptPage: '2', attemptSize: '5' },
        { type: 'query', metatype: GetAdminInquiryDetailReqDto },
      ),
    ).resolves.toMatchObject({ attemptPage: 2, attemptSize: 5 });
  });
  it.each([
    { page: 0 },
    { size: 101 },
    { status: 'SENT' },
    { status: 'APPROVED' },
    { inquiryType: 'OTHER' },
  ])('잘못된 검색 필터를 거부한다 (%j)', async (dto) => {
    await expect(
      pipe.transform(dto, { type: 'query', metatype: GetAdminInquiriesReqDto }),
    ).rejects.toThrow();
  });
  it('문의 처리 완료 필터는 COMPLETED를 사용한다', async () => {
    await expect(
      pipe.transform(
        { status: 'COMPLETED' },
        { type: 'query', metatype: GetAdminInquiriesReqDto },
      ),
    ).resolves.toMatchObject({ status: 'COMPLETED' });
  });
});
