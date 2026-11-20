import { ValidationPipe } from '@nestjs/common';
import { CreateAccountInquiryReqDto } from './dto/req/create-account-inquiry-req.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const valid = {
  inquiryType: 'PHONE_UNAVAILABLE',
  replyEmail: 'reply@example.com',
  content: '등록 휴대폰 사용 불가 문의입니다.',
};
const transform = (patch: Record<string, unknown>) =>
  pipe.transform(
    { ...valid, ...patch },
    { type: 'body', metatype: CreateAccountInquiryReqDto },
  );

describe('비로그인 계정·인증 문의 입력', () => {
  it.each(['LOGIN_FAILED_LOCKED', 'SUSPENDED', 'PHONE_UNAVAILABLE'])(
    '%s 유형은 회원·비밀번호·제목 없이 접수한다',
    async (inquiryType) => {
      await expect(transform({ inquiryType })).resolves.toMatchObject({
        ...valid,
        inquiryType,
      });
    },
  );
  it('회신 주소·내용의 공백을 제거하고 내용 줄바꿈을 유지한다', async () => {
    await expect(
      transform({
        replyEmail: '  reply@example.com  ',
        content: ' 첫 줄\n둘째 줄 ',
      }),
    ).resolves.toMatchObject({
      replyEmail: valid.replyEmail,
      content: '첫 줄\n둘째 줄',
    });
  });
  it('본문은 유니코드 문자 기준 5000자까지 허용한다', async () => {
    await expect(
      transform({ content: '😀'.repeat(5000) }),
    ).resolves.toMatchObject({ content: '😀'.repeat(5000) });
    await expect(transform({ content: '😀'.repeat(5001) })).rejects.toThrow();
  });
  it.each([
    { inquiryType: 'GENERAL' },
    { inquiryType: null },
    { inquiryType: undefined },
    { replyEmail: '' },
    { replyEmail: null },
    { replyEmail: undefined },
    { replyEmail: 123 },
    { replyEmail: 'bad' },
    { replyEmail: 'Name <reply@example.com>' },
    { replyEmail: 'a@example.com\r\nBcc:b@example.com' },
    { replyEmail: 'a'.repeat(244) + '@example.com' },
    { content: '' },
    { content: '   ' },
    { content: null },
    { content: undefined },
    { content: 123 },
    { content: ['문의'] },
    { content: '가'.repeat(5001) },
    { title: '사용자 지정 제목' },
    { userId: 1 },
    { loginId: 'member' },
    { password: 'password' },
    { status: 'APPROVED' },
    { assignedAdminId: 1 },
    { source: 'RESTRICTED_ACCOUNT' },
  ])(
    '잘못된 입력 또는 회원·관리자 정보 주입을 거부한다 (%j)',
    async (patch) => {
      await expect(transform(patch)).rejects.toThrow();
    },
  );
});
