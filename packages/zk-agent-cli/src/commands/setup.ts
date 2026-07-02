import { Command } from 'commander';

import { loadProjectConfig, saveProjectConfig } from '@zk-agent/agent-core';

import { printResult } from '../lib/io.js';
import {
  buildDefaultsRecommendedCommand,
  buildTopLevelNextRecommendedCommand,
  buildWalletCreateRecommendedCommand,
} from '../lib/recommended-commands.js';

interface SetupArgs {
  defaultChain?: string;
  connectorUrl?: string;
  force?: boolean;
}

export function createInitCommand(): Command {
  return new Command('init')
    .alias('setup')
    .description('Initialize local zk-agent configuration')
    .option('--default-chain <chain>', 'Default chain key', 'zksync-era')
    .option('--connector-url <url>', 'Connector UI base URL', 'http://localhost:4444')
    .option('--force', 'Overwrite an existing config', false)
    .action(async (options: SetupArgs) => {
      const recommendedCommands = {
        inspectDefaults: buildDefaultsRecommendedCommand(),
        createWallet: buildWalletCreateRecommendedCommand(),
        afterWalletApproval: buildTopLevelNextRecommendedCommand()
      };

      const existing = await loadProjectConfig();
      if (existing && !options.force) {
        printResult(
          [
            ['status', 'Config already exists. Re-run with --force to overwrite.'],
            ['default chain', existing.defaultChain],
            ['connector', existing.connectorUrl],
            ['inspect defaults', recommendedCommands.inspectDefaults],
            ['create wallet', recommendedCommands.createWallet],
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
          ['inspect defaults', recommendedCommands.inspectDefaults],
          ['create wallet', recommendedCommands.createWallet],
          ['after approval', recommendedCommands.afterWalletApproval]
        ],
        { ok: true, config, recommendedCommands }
      );
    });
}
