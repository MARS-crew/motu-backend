import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const OrderErrors = {} as const satisfies Record<
  string,
  ErrorDefinition
>;
