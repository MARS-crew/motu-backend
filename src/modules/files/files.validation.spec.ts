import {
  validateExternalUrl,
  validateFile,
  IMAGE_LIMIT,
  PDF_LIMIT,
} from './files.validation.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE0cAAAAASUVORK5CYII=',
  'base64',
);
const file = (
  originalname = 'image.png',
  mimetype = 'image/png',
  buffer = png,
) => ({ originalname, mimetype, buffer }) as Express.Multer.File;
describe('파일 정책', () => {
  it('PNG 실제 형식을 확인한다', async () => {
    expect(await validateFile(file(), true)).toEqual({
      contentType: 'image/png',
      extension: '.png',
    });
  });
  it('대문자 확장자를 허용한다', async () => {
    expect((await validateFile(file('IMAGE.PNG'), true)).contentType).toBe(
      'image/png',
    );
  });
  it('PDF를 증빙으로 허용한다', async () => {
    expect(
      (
        await validateFile(
          file(
            'evidence.pdf',
            'application/pdf',
            Buffer.from('%PDF-1.7\nexample'),
          ),
          false,
        )
      ).contentType,
    ).toBe('application/pdf');
  });
  it('로고/대표 이미지에 PDF를 거부한다', async () => {
    await expect(
      validateFile(
        file(
          'evidence.pdf',
          'application/pdf',
          Buffer.from('%PDF-1.7\nexample'),
        ),
        true,
      ),
    ).rejects.toMatchObject({ error: { code: 'FILE_INVALID_FORMAT' } });
  });
  it.each(['image.svg', 'image.gif', 'image.exe'])(
    '지원하지 않는 %s를 거부한다',
    async (name) => {
      await expect(validateFile(file(name), false)).rejects.toMatchObject({
        error: { code: 'FILE_INVALID_FORMAT' },
      });
    },
  );
  it('확장자 위장을 거부한다', async () => {
    await expect(
      validateFile(file('image.pdf', 'application/pdf'), false),
    ).rejects.toMatchObject({ error: { code: 'FILE_INVALID_FORMAT' } });
  });
  it('MIME 위장을 거부한다', async () => {
    await expect(
      validateFile(file('image.png', 'application/pdf'), false),
    ).rejects.toMatchObject({ error: { code: 'FILE_INVALID_FORMAT' } });
  });
  it('빈 파일을 거부한다', async () => {
    await expect(
      validateFile(file('image.png', 'image/png', Buffer.alloc(0)), false),
    ).rejects.toMatchObject({ error: { code: 'FILE_INVALID_FORMAT' } });
  });
  it('이미지 10MiB 경계는 허용하고 초과는 거부한다', async () => {
    const body = Buffer.alloc(IMAGE_LIMIT);
    png.copy(body);
    await expect(
      validateFile(file('image.png', 'image/png', body), false),
    ).resolves.toBeDefined();
    await expect(
      validateFile(
        file('image.png', 'image/png', Buffer.concat([body, Buffer.alloc(1)])),
        false,
      ),
    ).rejects.toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
  });
  it('PDF 20MiB 경계는 허용하고 초과는 거부한다', async () => {
    const body = Buffer.alloc(PDF_LIMIT);
    body.write('%PDF-1.7\n');
    await expect(
      validateFile(file('data.pdf', 'application/pdf', body), false),
    ).resolves.toBeDefined();
    await expect(
      validateFile(
        file(
          'data.pdf',
          'application/pdf',
          Buffer.concat([body, Buffer.alloc(1)]),
        ),
        false,
      ),
    ).rejects.toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
  });
  it('HTTPS 링크를 허용한다', () => {
    expect(validateExternalUrl('https://example.com/proof')).toBe(
      'https://example.com/proof',
    );
  });
  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'not-url',
    'https://',
    'https://user:pass@example.com',
    ' https://example.com',
  ])('잘못된 URL %s를 거부한다', (url) => {
    expect(() => validateExternalUrl(url)).toThrow();
  });
});
