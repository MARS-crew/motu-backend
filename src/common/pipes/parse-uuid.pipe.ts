import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';
import { INVALID_REQUEST_MESSAGE } from '../constants/validation.constants.js';

/** UUID v4 경로 값의 검증 실패 문구를 한글로 통일한다. */
@Injectable()
export class ParseUuidPipe extends ParseUUIDPipe {
  constructor() {
    super({
      version: '4',
      exceptionFactory: () => new BadRequestException(INVALID_REQUEST_MESSAGE),
    });
  }
}
