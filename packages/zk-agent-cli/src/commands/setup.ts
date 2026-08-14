import { Command } from 'commander';

import { loadProjectConfig, saveProjectConfig } from '@zk-agent/agent-core';

import { printResult } from '../lib/io.js';
import {
  buildDefaultsRecommendedCommand,
  buildRelayInspectRecommendedCommand,
  buildTopLevelNextRecommendedCommand,
  buildWalletCreateRecommendedCommand,
  buildWalletCreateRemoteRecommendedCommand,
} from '../lib/recommended-commands.js';

interface SetupArgs {
  defaultChain?: string;
  connectorUrl?: string;
  force?: boolean;
}

function buildSetupHelpText(): string {
  return [
    '',
    'What setup does:',
    '  Writes the local default chain and connector URL used by the first-run path.',
    '',
    'After setup, stay on the canonical local-first path:',
    '  zk-agent next',
    '  zk-agent wallet create --await-local',
    '  zk-agent next',
    '',
    'If the browser is not colocated with this terminal, switch at the wallet step:',
    '  zk-agent relay inspect --relay-url <url>',
    '  zk-agent wallet create --relay-url <url> --wait-relay --prompt-code',
    '  zk-agent next',
    '',
    'Environment note:',
    '  No custom .env is required for setup, next, or wallet request creation.',
    '  Add RPC env vars later, before live reads or broadcasts.'
  ].join('\n');
}

export function createInitCommand(): Command {
  return new Command('init')
    .alias('setup')
    .description('Initialize local zk-agent configuration for the default operator path')
    .addHelpText('after', buildSetupHelpText())
    .option('--default-chain <chain>', 'Default chain key', 'zksync-era')
    .option('--connector-url <url>', 'Connector UI base URL', 'http://localhost:4444')
    .option('--force', 'Overwrite an existing config', false)
    .action(async (options: SetupArgs) => {
      const recommendedCommands = {
        next: buildTopLevelNextRecommendedCommand(),
        inspectDefaults: buildDefaultsRecommendedCommand(),
        createWallet: buildWalletCreateRecommendedCommand(),
        relayInspect: buildRelayInspectRecommendedCommand(),
        createWalletRemote: buildWalletCreateRemoteRecommendedCommand(),
        afterWalletApproval: buildTopLevelNextRecommendedCommand()
      };

      const existing = await loadProjectConfig();
      if (existing && !options.force) {
        printResult(
          [
            ['status', 'Config already exists. Re-run with --force to overwrite.'],
            ['default chain', existing.defaultChain],
            ['connector', existing.connectorUrl],
            ['next', recommendedCommands.next],
            ['inspect defaults', recommendedCommands.inspectDefaults],
            ['create wallet (local)', recommendedCommands.createWallet],
            ['relay inspect', recommendedCommands.relayInspect],
            ['create wallet (remote)', recommendedCommands.createWalletRemote],
            ['after approval', recommendedCommands.afterWalletApproval]
          ],
          {
            ok: true,
            message: 'Config already exists. Re-run with --force to overwrite.',
            config: existing,
            recommendedCommands
          }
        );
        return;
      }

      const config = {
        defaultChain: options.defaultChain || 'zksync-era',
        connectorUrl: options.connectorUrl || 'http://localhost:4444',
        provider: 'zksync-sso' as const,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await saveProjectConfig(config);

      printResult(
        [
          ['status', 'Config saved'],
          ['default chain', config.defaultChain],
          ['connector', config.connectorUrl],
          ['next', recommendedCommands.next],
          ['inspect defaults', recommendedCommands.inspectDefaults],
          ['create wallet (local)', recommendedCommands.createWallet],
          ['relay inspect', recommendedCommands.relayInspect],
          ['create wallet (remote)', recommendedCommands.createWalletRemote],
          ['after approval', recommendedCommands.afterWalletApproval]
        ],
        { ok: true, config, recommendedCommands }
      );
    });
}
