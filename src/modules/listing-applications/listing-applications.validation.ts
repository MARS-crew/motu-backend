import { BusinessException } from '../../common/exceptions/business.exception.js';
import { ListingApplicationErrors } from './listing-applications.errors.js';

/** 도메인·기본 포트·후행 슬래시·fragment·쿼리 키 순서를 정규화한다. 경로 대소문자는 유지한다. */
export function normalizeListingUrl(
  input: string | null | undefined,
): string | null {
  const value = input?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password
    )
      throw new Error();
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    url.searchParams.sort();
    if (url.href.length > 2048) throw new Error();
    return url.href;
  } catch {
    throw new BusinessException(ListingApplicationErrors.URL);
  }
}
