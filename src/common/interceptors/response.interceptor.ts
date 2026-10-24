import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants.js';
import { Observable, map } from 'rxjs';
import { ApiSuccessResponse } from '../types/api-response.type.js';

/**
 * 컨트롤러 반환값을 `{ success: true, data }` 형태로 감싼다.
 * 파일 다운로드(StreamableFile)와 SSE(@Sse) 메시지는 감싸지 않는다. SSE 메시지를 감싸면 이벤트 이름이 사라진다.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T | null> | StreamableFile
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T | null> | StreamableFile> {
    const isSse = Reflect.getMetadata(SSE_METADATA, context.getHandler()) as
      boolean | undefined;
    if (isSse) {
      return next.handle() as unknown as Observable<
        ApiSuccessResponse<T | null>
      >;
    }
    return next.handle().pipe(
      map((data) =>
        data instanceof StreamableFile
          ? data
          : {
              success: true,
              data: data ?? null,
            },
      ),
    );
  }
}
