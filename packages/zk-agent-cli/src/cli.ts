import { Command, CommanderError } from 'commander';
import { config as loadEnv } from 'dotenv';

import {
  createAssetsCommand,
  createBalancesCommand,
  createBridgeCommand,
  createBridgeStatusCommand,
  createCallCommand,
  createDepositCommand,
  createDepositStatusCommand,
  createFundCommand,
  createPlannedCommands,
  createSendCommand,
  createSendTokenCommand,
  createSwapCommand,
  createWithdrawCommand,
  createWithdrawFinalizeCommand,
  createWithdrawStatusCommand
} from './commands/operations.js';
import { createInitCommand } from './commands/setup.js';
import { createNextCommand } from './commands/next.js';
import { createDefaultsCommand } from './commands/defaults.js';
import { createResolveTokenCommand } from './commands/resolve-token.js';
import { createTokensCommand } from './commands/tokens.js';
import { createRelayCommand } from './commands/relay.js';
import { createWalletCommand } from './commands/wallet.js';
import { createWorkflowCommand } from './commands/workflow.js';
import {
  formatErrorPayload,
  formatHumanErrorMessage,
  jsonOut,
  shouldJsonOutput
} from './lib/io.js';
import { buildWorkflowAutoRecommendedCommand } from './lib/recommended-commands.js';

function buildDefaultOperatorPathHelpText(): string {
  return [
    '',
    'Default operator path:',
    '  zk-agent setup',
    '  zk-agent next',
    '  zk-agent wallet create --await-local',
    '  zk-agent next',
    `  ${buildWorkflowAutoRecommendedCommand('main')}`,
    '',
    'Use `zk-agent next --request-id <id>` to continue a stored workflow checkpoint.'
  ].join('\n');
}

function createProgram(): Command {
  const program = new Command()
    .name('zk-agent')
    .description('zkSync and ZK Stack CLI scaffold for agent workflows')
    .showHelpAfterError()
    .option('--json', 'Force JSON output for agent harnesses', false)
    .hook('preAction', (thisCommand) => {
      if (thisCommand.optsWithGlobals().json) process.env.ZK_AGENT_OUTPUT = 'json';
    });

  program.addCommand(createInitCommand());
  program.addCommand(createNextCommand());
  program.addCommand(createDefaultsCommand());
  program.addCommand(createTokensCommand());
  program.addCommand(createResolveTokenCommand());
  program.addCommand(createRelayCommand());
  program.addCommand(createWalletCommand());
  program.addCommand(createWorkflowCommand());
  program.addCommand(createAssetsCommand());
  program.addCommand(createBalancesCommand());
  program.addCommand(createFundCommand());
  program.addCommand(createSendCommand());
  program.addCommand(createSendTokenCommand());
  program.addCommand(createCallCommand());
  program.addCommand(createSwapCommand());
  program.addCommand(createBridgeCommand());
  program.addCommand(createBridgeStatusCommand());
  program.addCommand(createDepositCommand());
  program.addCommand(createDepositStatusCommand());
  program.addCommand(createWithdrawCommand());
  program.addCommand(createWithdrawFinalizeCommand());
  program.addCommand(createWithdrawStatusCommand());

  for (const command of createPlannedCommands()) {
    program.addCommand(command);
  }

  program.addHelpText('after', buildDefaultOperatorPathHelpText());

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  loadEnv({ quiet: true });

  const program = createProgram();
  program.exitOverride();

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError && error.code === 'commander.helpDisplayed') return;

    if (shouldJsonOutput()) {
      jsonOut(formatErrorPayload(error));
    } else {
      process.stderr.write(`${formatHumanErrorMessage(error)}\n`);
    }

    process.exitCode = 1;
  }
}
