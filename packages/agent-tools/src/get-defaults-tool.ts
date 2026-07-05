import {
  describeDefaultTokenRegistrySources,
  listLocalTokenRegistryEntries,
  listTokenDirectoryIndexedChains,
  loadValidatedDefaults,
  type TokenRegistryEntry,
  type TokenDirectoryIndexedChain,
  type TokenRegistrySourceDescriptor,
  type ValidatedDefaultsPayload
} from '@zk-agent/agent-core';

import { createAgentTool } from './tool-helpers.js';
import type { AgentToolContext } from './types.js';

export interface GetDefaultsToolOutput {
  defaults: ValidatedDefaultsPayload;
  localTokenRegistry: TokenRegistryEntry[];
  tokenRegistrySources: TokenRegistrySourceDescriptor[];
  tokenDirectoryChains: TokenDirectoryIndexedChain[];
}

export function createGetDefaultsTool(_context: AgentToolContext) {
  return createAgentTool<Record<string, never>, GetDefaultsToolOutput>({
    name: 'getDefaultsTool',
    description:
      'Return the current machine-readable registry of supported, validated, experimental, and manually configured defaults.',
    execute: async () => ({
      defaults: loadValidatedDefaults(),
      localTokenRegistry: listLocalTokenRegistryEntries(),
      tokenRegistrySources: describeDefaultTokenRegistrySources(),
      tokenDirectoryChains: await listTokenDirectoryIndexedChains()
    })
  });
}
