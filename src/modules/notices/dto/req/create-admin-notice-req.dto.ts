import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';
import { INVALID_REQUEST_MESSAGE } from '../../../../common/constants/validation.constants.js';
import { NoticeStatus } from '../../../../generated/prisma/client.js';
import { UpdateAdminNoticeReqDto } from './update-admin-notice-req.dto.js';

const CREATE_STATUSES = [NoticeStatus.DRAFT, NoticeStatus.POSTED] as const;

export class CreateAdminNoticeReqDto extends UpdateAdminNoticeReqDto {
  @ApiPropertyOptional({
    enum: CREATE_STATUSES,
    default: NoticeStatus.POSTED,
    description:
      '임시 저장은 DRAFT. 게시에는 구분, 제목, 본문, 게시 시작일이 필요합니다.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(CREATE_STATUSES, { message: INVALID_REQUEST_MESSAGE })
  status?: (typeof CREATE_STATUSES)[number];
}
