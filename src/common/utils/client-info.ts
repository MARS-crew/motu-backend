import type { Request } from 'express';

/** 이력에 남길 접속 정보 */
export interface ClientInfo {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * 요청의 접속 IP와 User-Agent. 프록시(Railway)를 거치면 원래 IP는 X-Forwarded-For 맨 앞에 있다.
 * 이력 컬럼 길이(IP 45자, User-Agent 255자)에 맞춰 자른다.
 */
export function clientInfo(request: Request): ClientInfo {
  const forwarded = request.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim();
  return {
    ipAddress: (first || request.ip)?.slice(0, 45),
    userAgent: request.headers['user-agent']?.slice(0, 255),
  };
}
