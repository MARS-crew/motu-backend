import { Request } from 'express';
import { Role } from '../../generated/prisma/client.js';

/** Access 토큰에서 꺼낸 로그인 사용자 정보 */
export interface AuthUser {
  userId: number;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
