import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 로그인 없이 호출할 수 있는 API에 붙인다. 붙이지 않은 API는 모두 Access 토큰이 필요하다.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
