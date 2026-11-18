import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { INVALID_REQUEST_MESSAGE as M } from '../../../../common/constants/validation.constants.js';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class SaveInquiryReplyDraftReqDto {
  @ApiProperty({ description: '상세의 replyVersion. 최초 0', example: 0 })
  @IsInt({ message: M })
  @Min(0, { message: M })
  @Max(2147483646, { message: M })
  expectedVersion: number;
  @ApiProperty({
    description: '답변 내용 1~5000자',
    example: '안녕하세요. 계정 상태 확인 후 처리 절차를 안내드립니다.',
  })
  @Transform(trim)
  @IsString({ message: M })
  @Length(1, 5000, { message: M })
  replyText: string;
}
export class SendInquiryReplyReqDto {
  @ApiProperty({
    description: '새 발송마다 새 UUID. 응답 유실 시 같은 값으로 재요청',
    example: '7f52b4a4-211c-4c04-9317-1b355dc045bc',
  })
  @IsUUID('4', { message: M })
  requestId: string;
  @ApiProperty({
    description: '확인 팝업에서 검토한 저장 답변 버전',
    example: 1,
  })
  @IsInt({ message: M })
  @Min(1, { message: M })
  @Max(2147483647, { message: M })
  expectedDraftVersion: number;
  @ApiPropertyOptional({
    description:
      '이전 발송 여부가 불명확할 때 외부 발송 이력 확인 후 명시적 재발송 동의',
    default: false,
  })
  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean({ message: M })
  confirmResend?: boolean;
  @ApiPropertyOptional({ description: 'confirmResend=true일 때 필수, 1~200자' })
  @ValidateIf(
    (o: SendInquiryReplyReqDto, value: unknown) =>
      o.confirmResend === true || value !== undefined,
  )
  @Transform(trim)
  @IsString({ message: M })
  @Length(1, 200, { message: M })
  retryReason?: string;
}
