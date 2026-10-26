import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { INVALID_REQUEST_MESSAGE } from '../../common/constants/validation.constants.js';
import { GetNotificationsReqDto } from './dto/req/get-notifications-req.dto.js';

describe('알림 목록 요청 검증', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (query: unknown) =>
    pipe.transform(query, { type: 'query', metatype: GetNotificationsReqDto });
  it('기본값과 문자열 페이지 번호를 처리한다', async () => {
    expect(await validate({})).toMatchObject({ page: 1, size: 20 });
    expect(await validate({ page: '2', size: '10' })).toMatchObject({
      page: 2,
      size: 10,
    });
  });
  it.each([
    { page: '0' },
    { page: 'abc' },
    { page: '1.5' },
    { page: '100001' },
    { size: '51' },
    { size: '-1' },
  ])('검증 오류에는 한글 문구를 사용한다 (%j)', async (query) => {
    const error = await validate(query).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestException);
    const response = (error as BadRequestException).getResponse() as {
      message: string[];
    };
    expect(
      response.message.every((message) =>
        message.includes(INVALID_REQUEST_MESSAGE),
      ),
    ).toBe(true);
  });
  it('userId로 타인 목록을 지정할 수 없다', async () => {
    await expect(validate({ userId: '2' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
