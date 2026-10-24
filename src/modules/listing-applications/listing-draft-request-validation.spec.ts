import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { INVALID_REQUEST_MESSAGE } from '../../common/constants/validation.constants.js';
import { SaveListingDraftReqDto } from './dto/req/save-listing-draft-req.dto.js';

describe('임시저장 요청 검증', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (body: unknown) =>
    pipe.transform(body, { type: 'body', metatype: SaveListingDraftReqDto });
  it('필수값 없는 미완성 입력을 그대로 받는다', async () => {
    const body = {
      data: {
        serviceName: '가',
        businessEmail: '입력 중',
        desiredPrice: '',
        metricsStartDate: '2026-',
      },
    };
    await expect(validate(body)).resolves.toEqual(body);
    await expect(validate({})).resolves.toEqual({});
  });
  it.each([
    { currentStep: 0 },
    { currentStep: 5 },
    { currentStep: '2' },
    { data: [] },
    { data: { serviceName: 123 } },
    { data: { serviceName: '가'.repeat(31) } },
    { data: { evidenceCollectionId: 'not-uuid' } },
  ])('타입·저장 길이 위반에는 한글을 반환한다 (%j)', async (body) => {
    const error = await validate(body).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestException);
    const messages = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    expect(
      messages.message.every((message) =>
        message.includes(INVALID_REQUEST_MESSAGE),
      ),
    ).toBe(true);
  });
  it.each([
    { status: 'APPROVED' },
    { data: { applicationNumber: 'fake' } },
    { userId: 2 },
  ])('서버 전용 필드는 거부한다 (%j)', async (body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
