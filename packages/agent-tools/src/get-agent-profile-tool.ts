import { loadAgentIdentity, identityPluginStatus } from '@zk-agent/plugin-identity';

import { createAgentTool } from './tool-helpers.js';
import type { AgentToolContext } from './types.js';

export interface GetAgentProfileToolInput {
  walletName?: string;
}

export interface GetAgentProfileToolOutput {
  plugin: typeof identityPluginStatus;
  profileExists: boolean;
  profile: Awaited<ReturnType<typeof loadAgentIdentity>>;
  inspectedWallet: {
    walletName: string;
    exists: boolean;
  } | null;
  recommendedCommands: {
    status: string;
    show: string;
    set: string;
    walletStatus?: string;
  };
}

function buildRecommendedCommands(walletName?: string, hasProfile = false) {
  return {
    status: 'zk-agent agent status',
    show: 'zk-agent agent show',
    set: hasProfile
      ? 'zk-agent agent set --name <name>'
      : 'zk-agent agent set --name <name> --wallet main',
    walletStatus: walletName ? `zk-agent wallet status --name ${walletName}` : undefined
  };
}

export function createGetAgentProfileTool(context: AgentToolContext) {
  return createAgentTool<GetAgentProfileToolInput, GetAgentProfileToolOutput>({
    name: 'getAgentProfileTool',
    description:
      'Return the saved local agent profile and optionally confirm whether its linked wallet still exists locally.',
    execute: async (input) => {
      const profile = await loadAgentIdentity();
      const walletName = input.walletName || profile?.linkedWallet?.walletName;
      const wallet = walletName ? await context.loadWallet(walletName) : null;

      return {
        plugin: identityPluginStatus,
        profileExists: profile !== null,
        profile,
        inspectedWallet: walletName
          ? {
              walletName,
              exists: wallet !== null
            }
          : null,
        recommendedCommands: buildRecommendedCommands(walletName, profile !== null)
      };
    }
  });
}
