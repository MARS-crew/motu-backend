import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants.js';
import { Observable, map } from 'rxjs';
import { ApiSuccessResponse } from '../types/api-response.type.js';

/**
 * 컨트롤러 반환값을 `{ success: true, data }` 형태로 감싼다.
 * SSE(@Sse) 핸들러의 메시지는 감싸면 이벤트 이름이 사라지므로 그대로 둔다.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T | null>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T | null>> {
    const isSse = Reflect.getMetadata(SSE_METADATA, context.getHandler()) as
      boolean | undefined;
    if (isSse) {
      return next.handle() as unknown as Observable<
        ApiSuccessResponse<T | null>
      >;
    }
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data ?? null,
      })),
    );
  }
}
