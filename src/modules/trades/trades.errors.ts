import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const TradeErrors = {} as const satisfies Record<
  string,
  ErrorDefinition
>;
