import { ApiProperty } from '@nestjs/swagger';
import {
  InquiryStatus,
  InquiryType,
  InquiryReplyStatus,
  InquirySource,
} from '../../../../generated/prisma/client.js';
export class InquiryAdminActorResDto {
  @ApiProperty() userId: number;
  @ApiProperty() loginId: string;
  @ApiProperty({
    description:
      '관리자 표시 이름. 관리자명, 없으면 닉네임, 그것도 없으면 아이디',
  })
  nickname: string;
}
export class AdminInquiryItemResDto {
  @ApiProperty() id: number;
  @ApiProperty({
    enum: InquirySource,
    description:
      'PUBLIC_ACCOUNT_AUTH는 비로그인 접수. 이메일로 회원을 추정하지 않는다.',
  })
  source: InquirySource;
  @ApiProperty() inquiryCode: string;
  @ApiProperty({ enum: InquiryType }) inquiryType: InquiryType;
  @ApiProperty() title: string;
  @ApiProperty({
    enum: InquiryStatus,
    description: 'COMPLETED는 처리 완료. 회원 상태와 무관',
  })
  status: InquiryStatus;
  @ApiProperty() statusLabel: string;
  @ApiProperty({ type: InquiryAdminActorResDto, nullable: true })
  assignedAdmin: InquiryAdminActorResDto | null;
  @ApiProperty() createDate: Date;
  @ApiProperty() modifiedDate: Date;
  @ApiProperty({ type: Date, nullable: true }) processingStartedAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) completedAt: Date | null;
}
export class GetAdminInquiriesResDto {
  @ApiProperty({ type: [AdminInquiryItemResDto] })
  items: AdminInquiryItemResDto[];
  @ApiProperty() page: number;
  @ApiProperty() size: number;
  @ApiProperty() totalCount: number;
}
export class InquiryReplyAttemptResDto {
  @ApiProperty() id: string;
  @ApiProperty() requestId: string;
  @ApiProperty() adminId: number;
  @ApiProperty() draftVersion: number;
  @ApiProperty() toEmail: string;
  @ApiProperty() replyText: string;
  @ApiProperty({
    enum: InquiryReplyStatus,
    description: '2분 이상 경과한 SENDING은 UNKNOWN으로 표시. 자동 재발송 없음',
  })
  status: InquiryReplyStatus;
  @ApiProperty({ type: String, nullable: true }) deliveryMode: string | null;
  @ApiProperty({ type: String, nullable: true }) providerMessageId:
    string | null;
  @ApiProperty({ type: String, nullable: true }) errorCode: string | null;
  @ApiProperty({ type: String, nullable: true }) retryReason: string | null;
  @ApiProperty() createDate: Date;
  @ApiProperty({ type: Date, nullable: true }) finishedAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) finalizedAt: Date | null;
}
export class InquiryReplyAttemptsResDto {
  @ApiProperty({ type: [InquiryReplyAttemptResDto] })
  items: InquiryReplyAttemptResDto[];
  @ApiProperty() page: number;
  @ApiProperty() size: number;
  @ApiProperty() totalCount: number;
}
export class AdminInquiryDetailResDto extends AdminInquiryItemResDto {
  @ApiProperty() content: string;
  @ApiProperty({ type: String, nullable: true }) replyEmail: string | null;
  @ApiProperty({ type: String, nullable: true }) replyDraft: string | null;
  @ApiProperty() replyVersion: number;
  @ApiProperty({
    description:
      '처리 중이며 발송 중·불명확 결과·완료 반영 대기가 아닐 때 true. 최초 담당자와 관계없이 활성 관리자 공통.',
  })
  canEdit: boolean;
  @ApiProperty({ type: InquiryReplyAttemptResDto, nullable: true })
  latestReplyAttempt: InquiryReplyAttemptResDto | null;
  @ApiProperty({ type: InquiryReplyAttemptsResDto })
  replyAttempts: InquiryReplyAttemptsResDto;
  @ApiProperty() activityLogPath: string;
}
export class InquiryReplyResultResDto {
  @ApiProperty() inquiryId: number;
  @ApiProperty({ enum: InquiryStatus }) status: InquiryStatus;
  @ApiProperty() statusLabel: string;
  @ApiProperty({ type: Date, nullable: true }) completedAt: Date | null;
  @ApiProperty({ type: InquiryReplyAttemptResDto })
  attempt: InquiryReplyAttemptResDto;
  @ApiProperty({
    description: '콘솔 모의 발송이면 true이며 문의는 처리 중 유지',
  })
  simulated: boolean;
}

export class StartInquiryProcessingResDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: InquiryStatus }) status: InquiryStatus;
  @ApiProperty() statusLabel: string;
  @ApiProperty({ type: Number, nullable: true }) assignedAdminId: number | null;
  @ApiProperty({ type: Date, nullable: true }) processingStartedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) replyEmail: string | null;
  @ApiProperty() replyVersion: number;
}
export class SaveInquiryReplyDraftResDto {
  @ApiProperty() id: number;
  @ApiProperty({ enum: InquiryStatus }) status: InquiryStatus;
  @ApiProperty({ type: String, nullable: true }) replyDraft: string | null;
  @ApiProperty() replyVersion: number;
}
