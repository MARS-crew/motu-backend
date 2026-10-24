import { BadRequestException } from '@nestjs/common';
import { INVALID_REQUEST_MESSAGE } from '../constants/validation.constants.js';
import { ParseUuidPipe } from './parse-uuid.pipe.js';

describe('ParseUuidPipe', () => {
  const pipe = new ParseUuidPipe();
  const metadata = { type: 'param' as const, data: 'id' };

  it('UUID v4를 허용한다', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    await expect(pipe.transform(id, metadata)).resolves.toBe(id);
  });

  it.each(['not-uuid', '', '550e8400-e29b-11d4-a716-446655440000'])(
    '잘못된 UUID %s는 한글 문구와 400 상태로 반환한다',
    async (value) => {
      const error = await pipe
        .transform(value, metadata)
        .catch((err: unknown) => err);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: INVALID_REQUEST_MESSAGE,
      });
    },
  );
});
