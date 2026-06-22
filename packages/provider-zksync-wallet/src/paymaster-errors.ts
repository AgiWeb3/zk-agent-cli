import {
  classifyKnownTransactionValidationFailure,
  type KnownTransactionValidationFailure
} from '@zk-agent/agent-core';

export interface KnownPaymasterValidationFailure extends KnownTransactionValidationFailure {}

export function classifyKnownPaymasterValidationFailure(
  cause: string,
  options: { systemContextAddress: string }
): KnownPaymasterValidationFailure | undefined {
  return classifyKnownTransactionValidationFailure(cause, options);
}
