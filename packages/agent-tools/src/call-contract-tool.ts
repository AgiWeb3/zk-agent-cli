import type { ContractCallInput, ContractCallResult } from '@zk-agent/agent-core';

import type { AgentTool } from './types.js';

export function createCallContractTool(
  execute: (input: ContractCallInput) => Promise<ContractCallResult>
): AgentTool<ContractCallInput, ContractCallResult> {
  return {
    name: 'callContractTool',
    description: 'Execute a read-only contract call on zkSync using structured tool input.',
    execute
  };
}
