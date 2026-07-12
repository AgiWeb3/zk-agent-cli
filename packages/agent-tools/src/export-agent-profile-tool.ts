import {
  buildAgentIdentityExportRecord,
  requireAgentIdentity
} from '@zk-agent/plugin-identity';

import { createAgentTool } from './tool-helpers.js';
import type { AgentToolContext } from './types.js';

export interface ExportAgentProfileToolOutput {
  export: Awaited<ReturnType<typeof buildAgentIdentityExportRecord>>;
  recommendedCommands: {
    import: string;
    status: string;
  };
}

export function createExportAgentProfileTool(_context: AgentToolContext) {
  return createAgentTool<Record<string, never>, ExportAgentProfileToolOutput>({
    name: 'exportAgentProfileTool',
    description: 'Export the saved local agent profile as a portable bundle.',
    execute: async () => {
      const profile = await requireAgentIdentity();
      return {
        export: buildAgentIdentityExportRecord(profile),
        recommendedCommands: {
          import: 'zk-agent agent import --payload @agent-profile.json --overwrite',
          status: 'zk-agent agent status'
        }
      };
    }
  });
}
