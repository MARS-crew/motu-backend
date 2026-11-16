import { PartialType } from '@nestjs/swagger';
import { CreateAdminNoticeReqDto } from './create-admin-notice-req.dto.js';

export class UpdateAdminNoticeReqDto extends PartialType(
  CreateAdminNoticeReqDto,
  {
    skipNullProperties: false,
  },
) {}
