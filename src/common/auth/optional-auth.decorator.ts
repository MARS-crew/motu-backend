import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * 로그인 없이도 호출할 수 있지만, 토큰을 보내면 회원으로 처리하는 API에 붙인다.
 * 토큰이 없으면 `@CurrentUser()`가 undefined이고, 토큰이 만료되었거나 잘못되었으면 401로 막는다.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
