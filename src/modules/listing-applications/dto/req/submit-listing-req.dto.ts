import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, Matches, MaxLength } from 'class-validator';
import { INVALID_REQUEST_MESSAGE as MESSAGE } from '../../../../common/constants/validation.constants.js';

export class SubmitListingReqDto {
  @ApiProperty({
    description:
      '최종 확인 화면에서 조회한 신청서의 lastSavedAt. 미저장 입력은 먼저 저장한 뒤 응답 값을 사용한다.',
    example: '2026-11-22T00:00:00.000Z',
    format: 'date-time',
  })
  @IsString({ message: MESSAGE })
  @MaxLength(40, { message: MESSAGE })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/, { message: MESSAGE })
  @IsISO8601({ strict: true }, { message: MESSAGE })
  expectedLastSavedAt: string;
}
