import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { FileErrors } from './files.errors.js';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly client?: S3Client;
  private readonly bucket: string;
  private readonly localRoot: string;
  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? '';
    this.localRoot = resolve(
      config.get<string>('FILE_LOCAL_DIRECTORY') || '.data/uploads',
    );
    if (config.get('FILE_STORAGE_DRIVER') === 's3') {
      this.client = new S3Client({
        endpoint: config.get('S3_ENDPOINT'),
        region: config.get('S3_REGION') || 'us-east-1',
        forcePathStyle: config.get('S3_FORCE_PATH_STYLE') !== 'false',
        credentials: {
          accessKeyId: config.get('S3_ACCESS_KEY_ID') || '',
          secretAccessKey: config.get('S3_SECRET_ACCESS_KEY') || '',
        },
        maxAttempts: 2,
      });
    }
  }
  async put(key: string, body: Buffer, contentType: string) {
    try {
      if (this.client)
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        );
      else {
        const path = this.path(key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, body, { flag: 'wx' });
      }
    } catch {
      throw new BusinessException(FileErrors.STORAGE);
    }
  }
  async get(key: string): Promise<Buffer> {
    try {
      if (this.client) {
        const result = await this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        if (!result.Body) throw new Error();
        return Buffer.from(await result.Body.transformToByteArray());
      }
      return await readFile(this.path(key));
    } catch {
      throw new BusinessException(FileErrors.STORAGE);
    }
  }
  async remove(key: string) {
    if (this.client)
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    else
      await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
  async cleanup(keys: string[]) {
    const results = await Promise.allSettled(
      keys.map((key) => this.remove(key)),
    );
    if (results.some((result) => result.status === 'rejected'))
      this.logger.error(
        '미참조 업로드 파일 정리에 실패했습니다. 저장소 점검이 필요합니다.',
      );
  }
  private path(key: string) {
    // 키는 서버에서 생성한 UUID 경로만 허용한다.
    if (!/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|pdf)$/.test(key))
      throw new Error('Invalid object key');
    return resolve(this.localRoot, key);
  }
}
