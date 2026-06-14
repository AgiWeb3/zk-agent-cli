import type { CreateSessionRequestInput, CreateSessionRequestResult } from '@zk-agent/agent-core';

import type { AgentTool } from './types.js';

export function createWalletTool(
  execute: (input: CreateSessionRequestInput) => Promise<CreateSessionRequestResult>
): AgentTool<CreateSessionRequestInput, CreateSessionRequestResult> {
  return {
    name: 'createWalletTool',
    description: 'Create a zkSync smart-account session request for an agent-controlled wallet.',
    execute
  };
}
