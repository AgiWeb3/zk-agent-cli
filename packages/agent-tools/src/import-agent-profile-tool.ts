import {
  importAgentIdentityExportRecord,
  type AgentIdentityLinkedWallet
} from '@zk-agent/plugin-identity';

import { createAgentTool, requireWalletRecord } from './tool-helpers.js';
import type { AgentToolContext } from './types.js';

export interface ImportAgentProfileToolInput {
  exportRecord: unknown;
  walletName?: string;
  clearWalletLink?: boolean;
  overwrite?: boolean;
}

export interface ImportAgentProfileToolOutput {
  profile: Awaited<ReturnType<typeof importAgentIdentityExportRecord>>['profile'];
  importedFrom: Awaited<ReturnType<typeof importAgentIdentityExportRecord>>['importedFrom'];
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

export function createImportAgentProfileTool(context: AgentToolContext) {
  return createAgentTool<ImportAgentProfileToolInput, ImportAgentProfileToolOutput>({
    name: 'importAgentProfileTool',
    description:
      'Restore the local agent profile from an export bundle, with optional local wallet relinking.',
    execute: async (input) => {
      const wallet = input.walletName
        ? await requireWalletRecord(context, input.walletName)
        : null;

      const result = await importAgentIdentityExportRecord({
        exportRecord: input.exportRecord,
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
        overwrite: input.overwrite
      });

      return {
        profile: result.profile,
        importedFrom: result.importedFrom,
        recommendedCommands: {
          status: 'zk-agent agent status',
          show: 'zk-agent agent show',
          walletStatus: result.profile.linkedWallet?.walletName
            ? `zk-agent wallet status --name ${result.profile.linkedWallet.walletName}`
            : undefined
        }
      };
    }
  });
}
