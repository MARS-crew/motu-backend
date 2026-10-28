/** 차트 조회 기본 봉 개수 */
export const DEFAULT_CANDLE_SIZE = 100;

/** 차트 조회 최대 봉 개수 */
export const MAX_CANDLE_SIZE = 500;

/** 실시간 전송에서 호가·당일 요약·봉을 모아서 보내는 간격 (ms). 이 사이의 변경은 마지막 상태만 보낸다. */
export const STREAM_THROTTLE_MS = 100;

/** 실시간 전송 연결을 유지하기 위해 주석을 보내는 간격 (ms) */
export const STREAM_HEARTBEAT_MS = 15_000;
