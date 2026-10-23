import { ErrorDefinition } from '../../common/exceptions/business.exception.js';

export const HoldingErrors = {} as const satisfies Record<
  string,
  ErrorDefinition
>;
