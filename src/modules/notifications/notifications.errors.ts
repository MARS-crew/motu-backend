import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const NotificationErrors = {} as const satisfies Record<
  string,
  ErrorDefinition
>;
