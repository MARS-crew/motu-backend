import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { INVALID_REQUEST_MESSAGE } from '../../common/constants/validation.constants.js';
import { GetListingRevisionsReqDto } from './dto/req/get-listing-revisions-req.dto.js';
import { ResubmitListingRevisionReqDto } from './dto/req/resubmit-listing-revision-req.dto.js';

describe('사용자 보완 요청 DTO 검증', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it('저장한 묶음 UUID와 페이지 기본값을 허용한다', async () => {
    const body = {
      evidenceCollectionId: '11111111-1111-4111-8111-111111111111',
    };
    expect(
      await pipe.transform(body, {
        type: 'body',
        metatype: ResubmitListingRevisionReqDto,
      }),
    ).toMatchObject(body);
    expect(
      await pipe.transform(
        {},
        { type: 'query', metatype: GetListingRevisionsReqDto },
      ),
    ).toMatchObject({ page: 1, size: 10 });
  });
  it.each(['invalid', null, undefined])(
    '잘못된 묶음 UUID %s는 한글 오류다',
    async (id) => {
      const error = await pipe
        .transform(
          { evidenceCollectionId: id },
          { type: 'body', metatype: ResubmitListingRevisionReqDto },
        )
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: [INVALID_REQUEST_MESSAGE],
      });
    },
  );
  it.each([{ page: '0' }, { page: 'abc' }, { size: '51' }])(
    '페이지 검증에 한글 문구를 사용한다 (%j)',
    async (query) => {
      const error = await pipe
        .transform(query, {
          type: 'query',
          metatype: GetListingRevisionsReqDto,
        })
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(
        response.message.every((message) =>
          message.includes(INVALID_REQUEST_MESSAGE),
        ),
      ).toBe(true);
    },
  );
  it('상태·기한·소유자를 클라이언트가 바꿀 수 없다', async () => {
    await expect(
      pipe.transform(
        {
          evidenceCollectionId: '11111111-1111-4111-8111-111111111111',
          status: 'APPROVED',
          deadline: '2099-01-01T00:00:00Z',
          userId: 3,
        },
        { type: 'body', metatype: ResubmitListingRevisionReqDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
