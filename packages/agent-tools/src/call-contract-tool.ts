import type { ContractCallInput, ContractCallResult } from '@zk-agent/agent-core';

import { createAgentTool } from './tool-helpers.js';
import type { AgentToolContext } from './types.js';

export function createCallContractTool(
  context: AgentToolContext
) {
  return createAgentTool<ContractCallInput, ContractCallResult>({
    name: 'callContractTool',
    description: 'Execute a read-only contract call on zkSync using structured tool input.',
    execute: async (input) => context.provider.call(input)
  });
}
