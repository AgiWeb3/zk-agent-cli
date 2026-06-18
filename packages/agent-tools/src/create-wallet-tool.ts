import type { CreateSessionRequestInput, CreateSessionRequestResult } from '@zk-agent/agent-core';

import { createAgentTool } from './tool-helpers.js';
import type { AgentToolContext } from './types.js';

export function createWalletTool(
  context: AgentToolContext
) {
  return createAgentTool<CreateSessionRequestInput, CreateSessionRequestResult>({
    name: 'createWalletTool',
    description: 'Create a zkSync smart-account session request for an agent-controlled wallet.',
    execute: async (input) => context.provider.createSessionRequest(input)
  });
}
