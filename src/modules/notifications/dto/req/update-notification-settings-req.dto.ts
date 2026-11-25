import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';

export class UpdateNotificationSettingsReqDto {
  @ApiPropertyOptional({
    description:
      '전체 푸시 수신 여부. 생략하면 유지. OFF여도 야간 동의값은 보존',
    example: true,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: INVALID_REQUEST_MESSAGE })
  isPushEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      '저장할 야간 푸시 동의값. 이 요청 반영 후 전체 푸시가 ON일 때만 전달 가능',
    example: false,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: INVALID_REQUEST_MESSAGE })
  nightPushEnabled?: boolean;
}
