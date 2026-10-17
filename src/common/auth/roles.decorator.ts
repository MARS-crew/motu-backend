import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/client.js';

export const ROLES_KEY = 'roles';

/**
 * 지정한 역할만 호출할 수 있게 막는다. 예) @Roles(Role.ADMIN)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
