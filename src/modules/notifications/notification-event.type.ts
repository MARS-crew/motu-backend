/** 사용자 요청 DTO가 아닌 서버 내부 생산자 계약. 확정된 이벤트만 전달한다. */
interface NotificationEvent {
  userId: number;
  stockId: number;
  stockName: string;
  occurredAt: Date;
}

export interface OrderFilledNotificationEvent extends NotificationEvent {
  tradeId: string;
  orderId: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
}

export interface TargetPriceNotificationEvent extends NotificationEvent {
  alertId: string;
  /** 설정·수정할 때 발급하고 재시도 시 유지하는 버전 ID. 같은 버전은 최초 한 번만 기록한다. */
  revision: string;
  targetPrice: string;
  reachedPrice: string;
}

export interface DraftExpiringNotificationEvent {
  userId: number;
  applicationId: number;
  serviceName: string | null;
  expiresAt: Date;
}
