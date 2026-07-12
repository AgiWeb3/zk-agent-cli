import {
  identityPluginStatus,
  saveAgentIdentity,
  type AgentIdentityLinkedWallet
} from '@zk-agent/plugin-identity';

import { createAgentTool, requireWalletRecord } from './tool-helpers.js';
import type { AgentToolContext } from './types.js';

export interface SetAgentProfileToolInput {
  agentId?: string;
  name?: string;
  description?: string;
  uri?: string;
  walletName?: string;
  clearWalletLink?: boolean;
  tags?: string[];
  capabilities?: string[];
  metadata?: Record<string, string>;
  replaceTags?: boolean;
  replaceCapabilities?: boolean;
  replaceMetadata?: boolean;
}

export interface SetAgentProfileToolOutput {
  plugin: typeof identityPluginStatus;
  profile: Awaited<ReturnType<typeof saveAgentIdentity>>;
  recommendedCommands: {
    status: string;
    show: string;
    walletStatus?: string;
  };
}

function buildLinkedWallet(input: {
  walletName: string;
  walletAddress: string;
  chain: string;
  chainId: number;
  smartAccountProfileId?: string;
}): AgentIdentityLinkedWallet {
  return {
    walletName: input.walletName,
    walletAddress: input.walletAddress,
    chain: input.chain,
    chainId: input.chainId,
    smartAccountProfileId: input.smartAccountProfileId
  };
}

export function createSetAgentProfileTool(context: AgentToolContext) {
  return createAgentTool<SetAgentProfileToolInput, SetAgentProfileToolOutput>({
    name: 'setAgentProfileTool',
    description:
      'Create or update the local agent profile, optionally linking it to one stored wallet.',
    execute: async (input) => {
      const wallet = input.walletName
        ? await requireWalletRecord(context, input.walletName)
        : null;

      const profile = await saveAgentIdentity({
        agentId: input.agentId,
        name: input.name,
        description: input.description,
        uri: input.uri,
        tags: input.tags,
        capabilities: input.capabilities,
        metadata: input.metadata,
        linkedWallet: wallet
          ? buildLinkedWallet({
              walletName: wallet.walletName,
              walletAddress: wallet.walletAddress,
              chain: wallet.chain,
              chainId: wallet.chainId,
              smartAccountProfileId: wallet.smartAccountProfileId
            })
          : undefined,
        clearWalletLink: input.clearWalletLink,
        replaceTags: input.replaceTags,
        replaceCapabilities: input.replaceCapabilities,
        replaceMetadata: input.replaceMetadata
      });

      return {
        plugin: identityPluginStatus,
        profile,
        recommendedCommands: {
          status: 'zk-agent agent status',
          show: 'zk-agent agent show',
          walletStatus: profile.linkedWallet?.walletName
            ? `zk-agent wallet status --name ${profile.linkedWallet.walletName}`
            : undefined
        }
      };
    }
  });
}
