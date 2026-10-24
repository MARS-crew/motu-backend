import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { KeyedSerialQueue } from './serial-queue.js';

@Injectable()
export class MatchingService {
  /** 종목별 작업 순서. 같은 종목의 주문·체결·취소는 한 번에 하나씩 실행한다. */
  private readonly queue = new KeyedSerialQueue<number>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 같은 종목의 다른 작업이 끝난 뒤에 task를 실행한다.
   * 호가창을 읽거나 바꾸는 작업(주문, 취소)은 모두 이 안에서 실행해야 한다.
   */
  runExclusive<T>(stockId: number, task: () => Promise<T>): Promise<T> {
    return this.queue.run(stockId, task);
  }
}
