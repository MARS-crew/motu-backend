import { ChartInterval } from '../../generated/prisma/client.js';
import { candleStartOf } from './candle-time.js';

/** UTC 시각 문자열 → Date */
const utc = (value: string) => new Date(`${value}Z`);

describe('candleStartOf', () => {
  it('분봉은 그 분의 시작이다', () => {
    expect(
      candleStartOf(utc('2026-10-24T05:37:42.123'), ChartInterval.MINUTE),
    ).toEqual(utc('2026-10-24T05:37:00.000'));
  });

  it('시간봉은 그 시간의 시작이다', () => {
    expect(
      candleStartOf(utc('2026-10-24T05:37:42.123'), ChartInterval.HOUR),
    ).toEqual(utc('2026-10-24T05:00:00.000'));
  });

  describe('일봉은 한국 시간 00시에 시작한다', () => {
    it('한국 시간 10월 24일 23:59:59는 24일 봉이다', () => {
      // UTC 10월 24일 14:59:59 = 한국 시간 10월 24일 23:59:59
      expect(
        candleStartOf(utc('2026-10-24T14:59:59.999'), ChartInterval.DAY),
      ).toEqual(utc('2026-10-23T15:00:00.000'));
    });

    it('한국 시간 10월 25일 00:00은 25일 봉이다', () => {
      expect(
        candleStartOf(utc('2026-10-24T15:00:00.000'), ChartInterval.DAY),
      ).toEqual(utc('2026-10-24T15:00:00.000'));
    });
  });

  describe('주봉은 한국 시간 월요일 00시에 시작한다', () => {
    it('토요일은 그 주 월요일 봉이다', () => {
      // 한국 시간 2026-10-24(토) 14:00 → 2026-10-19(월) 00:00
      expect(
        candleStartOf(utc('2026-10-24T05:00:00.000'), ChartInterval.WEEK),
      ).toEqual(utc('2026-10-18T15:00:00.000'));
    });

    it('일요일 23:59는 아직 그 주다', () => {
      // 한국 시간 2026-10-25(일) 23:59
      expect(
        candleStartOf(utc('2026-10-25T14:59:00.000'), ChartInterval.WEEK),
      ).toEqual(utc('2026-10-18T15:00:00.000'));
    });

    it('월요일 00:00부터 새 주다', () => {
      // 한국 시간 2026-10-26(월) 00:00
      expect(
        candleStartOf(utc('2026-10-25T15:00:00.000'), ChartInterval.WEEK),
      ).toEqual(utc('2026-10-25T15:00:00.000'));
    });
  });

  describe('월봉은 한국 시간 1일 00시에 시작한다', () => {
    it('월 중간은 그 달 1일 봉이다', () => {
      // 한국 시간 2026-10-15 → 2026-10-01 00:00
      expect(
        candleStartOf(utc('2026-10-15T03:00:00.000'), ChartInterval.MONTH),
      ).toEqual(utc('2026-09-30T15:00:00.000'));
    });

    it('UTC로는 10월 31일이어도 한국 시간 11월 1일이면 11월 봉이다', () => {
      // UTC 10월 31일 15:30 = 한국 시간 11월 1일 00:30
      expect(
        candleStartOf(utc('2026-10-31T15:30:00.000'), ChartInterval.MONTH),
      ).toEqual(utc('2026-10-31T15:00:00.000'));
    });

    it('1월은 전년 12월 31일 15시(UTC)에 시작한다', () => {
      expect(
        candleStartOf(utc('2027-01-10T00:00:00.000'), ChartInterval.MONTH),
      ).toEqual(utc('2026-12-31T15:00:00.000'));
    });
  });
});
