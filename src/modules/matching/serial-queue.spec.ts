import { KeyedSerialQueue } from './serial-queue.js';

/** 밖에서 끝낼 수 있는 Promise */
const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** 대기 중인 마이크로태스크를 모두 처리한다. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('KeyedSerialQueue', () => {
  it('같은 키의 작업은 앞 작업이 끝난 뒤에 시작한다', async () => {
    const queue = new KeyedSerialQueue<number>();
    const first = deferred();
    const started: string[] = [];

    const a = queue.run(1, async () => {
      started.push('a');
      await first.promise;
    });
    const b = queue.run(1, () => {
      started.push('b');
      return Promise.resolve();
    });

    await flush();
    expect(started).toEqual(['a']);

    first.resolve();
    await Promise.all([a, b]);
    expect(started).toEqual(['a', 'b']);
  });

  it('같은 키의 작업은 넣은 순서대로 실행한다', async () => {
    const queue = new KeyedSerialQueue<number>();
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        queue.run(1, async () => {
          // 뒤에 넣은 작업이 더 빨리 끝나더라도 순서는 바뀌지 않아야 한다.
          await new Promise((resolve) => setTimeout(resolve, 5 - n));
          order.push(n);
        }),
      ),
    );

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('다른 키의 작업은 기다리지 않고 함께 실행한다', async () => {
    const queue = new KeyedSerialQueue<number>();
    const first = deferred();
    const started: number[] = [];

    const a = queue.run(1, async () => {
      started.push(1);
      await first.promise;
    });
    const b = queue.run(2, () => {
      started.push(2);
      return Promise.resolve();
    });

    await b;
    expect(started).toEqual([1, 2]);

    first.resolve();
    await a;
  });

  it('작업의 결과를 돌려준다', async () => {
    const queue = new KeyedSerialQueue<number>();

    await expect(queue.run(1, () => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('앞 작업이 실패해도 다음 작업은 실행되고, 실패는 그 작업을 넣은 쪽에만 전달된다', async () => {
    const queue = new KeyedSerialQueue<number>();

    const failed = queue.run(1, () => Promise.reject(new Error('실패')));
    const next = queue.run(1, () => Promise.resolve('다음'));

    await expect(failed).rejects.toThrow('실패');
    await expect(next).resolves.toBe('다음');
  });

  it('작업 안에서 바로 던진 에러도 실패로 전달한다', async () => {
    const queue = new KeyedSerialQueue<number>();

    const failed = queue.run(1, () => {
      throw new Error('바로 실패');
    });

    await expect(failed).rejects.toThrow('바로 실패');
    await expect(queue.run(1, () => Promise.resolve(1))).resolves.toBe(1);
  });

  it('모든 작업이 끝난 키는 정리한다', async () => {
    const queue = new KeyedSerialQueue<number>();

    await Promise.all([
      queue.run(1, () => Promise.resolve()),
      queue.run(2, () => Promise.reject(new Error('실패'))).catch(() => {}),
    ]);
    await flush();

    expect(queue.size).toBe(0);
  });
});
