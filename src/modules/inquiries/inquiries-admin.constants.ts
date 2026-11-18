import {
  InquiryStatus,
  InquiryReplyStatus,
} from '../../generated/prisma/client.js';
/** Brevo 요청 제한(10초)보다 길게 잡는다. 중단된 요청은 자동 재발송하지 않는다. */
export const INQUIRY_REPLY_STALE_MS = 120000;
export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  SUBMITTED: '접수',
  IN_PROGRESS: '처리 중',
  APPROVED: '처리 완료',
};
export function effectiveReplyStatus(
  attempt: { status: InquiryReplyStatus; createDate: Date },
  now = new Date(),
): InquiryReplyStatus {
  return attempt.status === InquiryReplyStatus.SENDING &&
    now.getTime() - attempt.createDate.getTime() >= INQUIRY_REPLY_STALE_MS
    ? InquiryReplyStatus.UNKNOWN
    : attempt.status;
}
