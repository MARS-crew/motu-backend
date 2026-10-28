/**
 * 키별로 작업을 한 줄로 세워 하나씩 실행한다. 다른 키의 작업은 서로 기다리지 않는다.
 * 서버 한 대에서만 순서를 보장한다. (서버가 여러 대가 되면 분산 락이 필요하다.)
 */
export class KeyedSerialQueue<K> {
  /** 키별 마지막 작업. 다음 작업은 이 작업이 끝난 뒤에 시작한다. */
  private readonly tails = new Map<K, Promise<void>>();

  /** 작업이 남아 있는 키 수 */
  get size(): number {
    return this.tails.size;
  }

  run<T>(key: K, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);

    // 작업이 실패해도 다음 작업은 이어서 실행한다. 실패는 result로 호출한 쪽에 전달된다.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      // 그 사이 새 작업이 들어오지 않았으면 키를 정리한다.
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    });

    return result;
  }
}
