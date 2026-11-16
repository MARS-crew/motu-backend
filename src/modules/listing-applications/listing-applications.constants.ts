import { ListingApplicationStatus } from '../../generated/prisma/client.js';

export const LISTING_STATUS_LABELS: Record<ListingApplicationStatus, string> = {
  DRAFT: '임시 저장',
  SUBMITTED: '접수',
  UNDER_REVIEW: '검토 중',
  REVISION_REQUESTED: '보완 요청',
  APPROVED: '승인',
  REJECTED: '반려',
  EXPIRED: '만료',
};

export const REVIEWABLE_LISTING_STATUSES = [
  ListingApplicationStatus.SUBMITTED,
  ListingApplicationStatus.UNDER_REVIEW,
  ListingApplicationStatus.REVISION_REQUESTED,
  ListingApplicationStatus.APPROVED,
  ListingApplicationStatus.REJECTED,
] as const;

export const ADMIN_LISTING_PAGE_SIZE = 20;
export const ADMIN_LISTING_MAX_PAGE_SIZE = 100;

export const MAX_LISTING_DRAFTS = 5;
export const LISTING_DRAFT_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const LISTING_DRAFT_WARNING_MS = 7 * 24 * 60 * 60 * 1000;
export const LISTING_DRAFT_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
