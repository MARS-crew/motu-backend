import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const PriceAlertErrors = {} as const satisfies Record<
  string,
  ErrorDefinition
>;
