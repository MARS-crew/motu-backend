import { BadRequestException, Injectable, ParseIntPipe } from '@nestjs/common';
import { INVALID_REQUEST_MESSAGE } from '../constants/validation.constants.js';

/** 경로 값을 정수 ID로 바꾼다. 숫자가 아니면 영어 기본 문구 대신 한글 문구로 400을 낸다. */
@Injectable()
export class ParseIdPipe extends ParseIntPipe {
  constructor() {
    super({
      exceptionFactory: () => new BadRequestException(INVALID_REQUEST_MESSAGE),
    });
  }
}
