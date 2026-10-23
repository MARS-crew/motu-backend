import { extname } from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { FileErrors } from './files.errors.js';

export const IMAGE_LIMIT = 10 * 1024 * 1024;
export const PDF_LIMIT = 20 * 1024 * 1024;

export async function validateFile(
  file: Express.Multer.File,
  imageOnly: boolean,
) {
  if (
    !file?.buffer?.length ||
    !file.originalname ||
    file.originalname.length > 255
  )
    throw new BusinessException(FileErrors.FORMAT);
  const extension = extname(file.originalname).toLowerCase();
  const allowed: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
  };
  const mime = allowed[extension];
  if (!mime || (imageOnly && mime === 'application/pdf'))
    throw new BusinessException(FileErrors.FORMAT);
  if (
    file.buffer.length > (mime === 'application/pdf' ? PDF_LIMIT : IMAGE_LIMIT)
  )
    throw new BusinessException(FileErrors.SIZE);
  let detected;
  try {
    detected = await fileTypeFromBuffer(file.buffer);
  } catch {
    throw new BusinessException(FileErrors.FORMAT);
  }
  if (detected?.mime !== mime || file.mimetype !== mime)
    throw new BusinessException(FileErrors.FORMAT);
  return {
    contentType: mime,
    extension: mime === 'image/jpeg' ? '.jpg' : extension,
  };
}

export function validateExternalUrl(value: string): string {
  try {
    const url = new URL(value);
    if (
      value !== value.trim() ||
      value.length > 2048 ||
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.href;
  } catch {
    throw new BusinessException(FileErrors.URL);
  }
}
