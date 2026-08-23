import { Command } from 'commander';

import { loadProjectConfig, saveProjectConfig } from '@zk-agent/agent-core';

import { printResult } from '../lib/io.js';
import {
  buildOnboardingSummary,
  onboardingSummaryLines
} from '../lib/onboarding-summary.js';
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
    'Validated first-run baseline:',
    '  Default chain:   zksync-sepolia',
    '  Connector URL:   http://localhost:4444',
    '  Override --default-chain or --connector-url only when you intentionally deviate from that path.',
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
    .description('Initialize local zk-agent configuration for the validated first-run operator path')
    .addHelpText('after', buildSetupHelpText())
    .option('--default-chain <chain>', 'Default chain key', 'zksync-sepolia')
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
        const onboardingSummary = buildOnboardingSummary({
          stage: 'wallet-bootstrap',
          localOnly: true,
          configExists: true,
          defaultChain: existing.defaultChain,
          connectorUrl: existing.connectorUrl,
          nextAction: recommendedCommands.next,
          notes: [
            'Setup did not overwrite the existing local defaults.',
            'Run zk-agent next so the CLI can choose wallet bootstrap or workflow follow-up from the current local state.'
          ]
        });

        printResult(
          [
            ['status', 'Config already exists. Re-run with --force to overwrite.'],
            ...onboardingSummaryLines(onboardingSummary),
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
            onboardingSummary,
            recommendedCommands
          }
        );
        return;
      }

      const config = {
        defaultChain: options.defaultChain || 'zksync-sepolia',
        connectorUrl: options.connectorUrl || 'http://localhost:4444',
        provider: 'zksync-sso' as const,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await saveProjectConfig(config);

      const onboardingSummary = buildOnboardingSummary({
        stage: 'wallet-bootstrap',
        localOnly: true,
        configExists: true,
        defaultChain: config.defaultChain,
        connectorUrl: config.connectorUrl,
        nextAction: recommendedCommands.next,
        notes: [
          'Setup only writes local defaults and does not inspect wallet state.',
          'Stay on zk-agent next so the product entrypoint can decide between wallet bootstrap and workflow guidance.'
        ]
      });

      printResult(
        [
          ['status', 'Config saved'],
          ...onboardingSummaryLines(onboardingSummary),
          ['default chain', config.defaultChain],
          ['connector', config.connectorUrl],
          ['next', recommendedCommands.next],
          ['inspect defaults', recommendedCommands.inspectDefaults],
          ['create wallet (local)', recommendedCommands.createWallet],
          ['relay inspect', recommendedCommands.relayInspect],
          ['create wallet (remote)', recommendedCommands.createWalletRemote],
          ['after approval', recommendedCommands.afterWalletApproval]
        ],
        { ok: true, config, onboardingSummary, recommendedCommands }
      );
    });
}
