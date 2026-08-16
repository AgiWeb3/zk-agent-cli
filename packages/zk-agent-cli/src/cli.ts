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
import { createDoctorCommand } from './commands/doctor.js';
import { createAgentCommand } from './commands/agent.js';
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
import { buildWorkflowPayRecommendedCommand } from './lib/recommended-commands.js';

function buildDefaultOperatorPathHelpText(): string {
  return [
    '',
    'Public entrypoints:',
    '  Agent harness: npx skills add https://github.com/AgiWeb3/zk-agent-cli',
    '  One-shot CLI:  npx zk-agent-cli --help',
    '  Global CLI:    npm install -g zk-agent-cli',
    '',
    'Canonical terminal path:',
    '  zk-agent setup',
    '  zk-agent next',
    '  zk-agent wallet create --await-local',
    '  zk-agent next',
    `  ${buildWorkflowPayRecommendedCommand('main')}`,
    '',
    'If local setup or wallet state is unclear:',
    '  zk-agent doctor',
    '',
    'No custom .env is required for setup, next, or wallet create/reapprove request generation.',
    'Add RPC env vars later, before live reads or broadcasts.',
    '',
    'Use `zk-agent next --request-id <id>` to continue a stored workflow checkpoint.',
    'Use `zk-agent relay inspect --relay-url <url>` plus `zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code` when the browser is not colocated.',
    'Use `zk-agent wallet --help` for wallet recovery details and `zk-agent workflow --help` when the intent is broader than the flagship native-send path.'
  ].join('\n');
}

const ROOT_HELP_COMMAND_ORDER = [
  'next',
  'doctor',
  'init',
  'wallet',
  'workflow',
  'assets',
  'balances',
  'fund',
  'send',
  'send-token',
  'call',
  'swap',
  'bridge',
  'bridge-status',
  'deposit',
  'deposit-status',
  'withdraw',
  'withdraw-status',
  'withdraw-finalize',
  'tokens',
  'resolve-token',
  'defaults',
  'relay',
  'agent'
] as const;

function applyRootHelpCommandOrder(program: Command): void {
  const order = new Map<string, number>(ROOT_HELP_COMMAND_ORDER.map((name, index) => [name, index]));
  const sortedCommands = [...program.commands].sort((left: Command, right: Command) => {
    const leftOrder = order.get(left.name()) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.name()) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.name().localeCompare(right.name());
  });
  ((program as unknown) as { commands: Command[] }).commands = sortedCommands;
}

function createProgram(): Command {
  const program = new Command()
    .name('zk-agent')
    .description(
      'Local-first zkSync Era CLI for wallet approval, workflow execution, and hosted relay recovery'
    )
    .showHelpAfterError()
    .option('--json', 'Force JSON output for agent harnesses', false)
    .hook('preAction', (thisCommand) => {
      if (thisCommand.optsWithGlobals().json) process.env.ZK_AGENT_OUTPUT = 'json';
    });

  program.addCommand(createInitCommand());
  program.addCommand(createNextCommand());
  program.addCommand(createDoctorCommand());
  program.addCommand(createAgentCommand());
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

  applyRootHelpCommandOrder(program);
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
