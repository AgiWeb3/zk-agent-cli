import { loadValidatedDefaults, type ValidatedDefaultsPayload } from '@zk-agent/agent-core';

import { createAgentTool } from './tool-helpers.js';
import type { AgentToolContext } from './types.js';

export type GetDefaultsToolOutput = ValidatedDefaultsPayload;

export function createGetDefaultsTool(_context: AgentToolContext) {
  return createAgentTool<Record<string, never>, GetDefaultsToolOutput>({
    name: 'getDefaultsTool',
    description:
      'Return the current machine-readable registry of supported, validated, experimental, and manually configured defaults.',
    execute: async () => loadValidatedDefaults()
  });
}
