import { CallHandler, ExecutionContext } from '@nestjs/common';
import { SSE_METADATA } from '@nestjs/common/constants.js';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor.js';

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();
  const contextOf = (handler: () => void) =>
    ({ getHandler: () => handler }) as unknown as ExecutionContext;
  const nextOf = (value: unknown) =>
    ({ handle: () => of(value) }) as CallHandler;

  it('컨트롤러 반환값을 { success: true, data }로 감싼다', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        contextOf(() => {}),
        nextOf({ id: 1 }),
      ),
    );

    expect(result).toEqual({ success: true, data: { id: 1 } });
  });

  it('반환값이 없으면 data는 null이다', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        contextOf(() => {}),
        nextOf(undefined),
      ),
    );

    expect(result).toEqual({ success: true, data: null });
  });

  it('SSE 핸들러의 메시지는 감싸지 않는다', async () => {
    const handler = () => {};
    Reflect.defineMetadata(SSE_METADATA, true, handler);
    const message = { type: 'trade', data: { price: 4_400 } };

    const result = await lastValueFrom(
      interceptor.intercept(contextOf(handler), nextOf(message)),
    );

    expect(result).toBe(message);
  });
});
