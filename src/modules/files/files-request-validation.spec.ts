import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { INVALID_REQUEST_MESSAGE } from '../../common/constants/validation.constants.js';
import { CreateCollectionReqDto } from './dto/req/create-collection-req.dto.js';
import { CreateLinkReqDto } from './dto/req/create-link-req.dto.js';
import { SaveCollectionReqDto } from './dto/req/save-collection-req.dto.js';

describe('파일 요청 DTO 검증 문구', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const id = '550e8400-e29b-41d4-a716-446655440000';

  it.each([
    [CreateCollectionReqDto, {}],
    [CreateCollectionReqDto, { purpose: 'UNKNOWN' }],
    [CreateLinkReqDto, {}],
    [CreateLinkReqDto, { url: 123 }],
    [CreateLinkReqDto, { url: 'a'.repeat(2049) }],
    [SaveCollectionReqDto, {}],
    [SaveCollectionReqDto, { attachmentIds: 'not-array' }],
    [SaveCollectionReqDto, { attachmentIds: ['not-uuid'] }],
    [SaveCollectionReqDto, { attachmentIds: [id, id] }],
    [SaveCollectionReqDto, { attachmentIds: Array(11).fill(id) }],
    [SaveCollectionReqDto, { attachmentIds: [], description: 123 }],
    [SaveCollectionReqDto, { attachmentIds: [], description: 'a'.repeat(501) }],
    [SaveCollectionReqDto, { attachmentIds: [], validateStep: 'true' }],
  ])(
    '%s의 잘못된 요청은 영어 기본 문구를 반환하지 않는다 (%j)',
    async (metatype, body) => {
      const error = await pipe
        .transform(body, { type: 'body', metatype })
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(response.message.length).toBeGreaterThan(0);
      expect(
        response.message.every(
          (message) => message === INVALID_REQUEST_MESSAGE,
        ),
      ).toBe(true);
    },
  );

  it.each([
    [CreateCollectionReqDto, { purpose: 'EVIDENCE' }],
    [CreateLinkReqDto, { url: 'https://example.com/proof' }],
    [
      SaveCollectionReqDto,
      {
        attachmentIds: [id],
        description: '증빙 자료 설명입니다.',
        validateStep: true,
      },
    ],
    [SaveCollectionReqDto, { attachmentIds: [] }],
  ])('%s의 정상 요청은 허용한다', async (metatype, body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype }),
    ).resolves.toEqual(body);
  });
});
