import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MatchingService } from './matching.service.js';

describe('MatchingService', () => {
  const service = new MatchingService({} as PrismaService);

  describe('runExclusive', () => {
    it('같은 종목의 작업은 하나씩 순서대로 실행한다', async () => {
      const log: string[] = [];
      const task = (name: string, ms: number) => async () => {
        log.push(`${name} 시작`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        log.push(`${name} 끝`);
        return name;
      };

      const results = await Promise.all([
        service.runExclusive(1, task('a', 10)),
        service.runExclusive(1, task('b', 0)),
      ]);

      expect(results).toEqual(['a', 'b']);
      expect(log).toEqual(['a 시작', 'a 끝', 'b 시작', 'b 끝']);
    });

    it('다른 종목의 작업은 함께 실행한다', async () => {
      const log: string[] = [];
      const task = (name: string, ms: number) => async () => {
        log.push(`${name} 시작`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        log.push(`${name} 끝`);
      };

      await Promise.all([
        service.runExclusive(1, task('a', 10)),
        service.runExclusive(2, task('b', 0)),
      ]);

      expect(log).toEqual(['a 시작', 'b 시작', 'b 끝', 'a 끝']);
    });
  });
});
