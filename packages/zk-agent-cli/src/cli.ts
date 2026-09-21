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
import { createNextCommand, createStartCommand } from './commands/next.js';
import { createDoctorCommand } from './commands/doctor.js';
import { createAgentCommand } from './commands/agent.js';
import { createDefaultsCommand } from './commands/defaults.js';
import { createPaymentCommand, createSubmitCommand, createWorkspaceCommand } from './commands/payment.js';
import { createResolveTokenCommand } from './commands/resolve-token.js';
import { createSuiteCommand } from './commands/suite.js';
import { createTokensCommand } from './commands/tokens.js';
import { createRelayCommand } from './commands/relay.js';
import { createWalletCommand } from './commands/wallet.js';
import { createPayCommand, createWorkflowCommand } from './commands/workflow.js';
import {
  formatErrorPayload,
  formatHumanErrorMessage,
  jsonOut,
  shouldJsonOutput
} from './lib/io.js';
import {
  buildSubmitRecommendedCommand,
  buildTopLevelPayRecommendedCommand
} from './lib/recommended-commands.js';

function buildDefaultOperatorPathHelpText(): string {
  return [
    '',
    'Public entrypoints:',
    '  Public first touch: zk-agent start',
    '  Agent harness: npx skills add https://github.com/AgiWeb3/zk-agent-cli',
    '  One-shot CLI:  npx zk-agent-cli --help',
    '  Global CLI:    npm install -g zk-agent-cli',
    '',
    'Why use it:',
    '  local-first wallet and session control',
    '  zkSync-native smart-account and paymaster path centered on sed-lite',
    '  Agent Pay request capture and follow-up surface around the same wallet runtime',
    '',
    'What makes zk-agent-cli different:',
    '  local-first by default, with hosted approval only as a fallback path',
    '  one zkSync-native path from wallet readiness to paymaster-aware execution',
    '  one Agent Pay layer that stays attached to the same wallet runtime instead of splitting into a separate product',
    '',
    'Why Agent Pay instead of only direct execution:',
    '  capture one request before or after the write path',
    '  keep a cross-request operator workspace around the same wallet runtime',
    '  export stable handoff and feed views for external agents, dashboards, or backends',
    '  current request ingress: zk-agent submit',
    '  current workbench anchor: zk-agent workspace',
    '',
    'Start here first:',
    '  zk-agent setup',
    '  zk-agent next',
    '  zk-agent wallet create --await-local',
    '  zk-agent next',
    `  ${buildTopLevelPayRecommendedCommand('main')}`,
    '  Stop after the first successful workflow pay.',
    '',
    'Before that first success:',
    '  Ignore suite, payment, and relay unless the CLI points you there or the browser is remote.',
    '',
    'Start here by question:',
    '  start        -> public first touch with the same output contract as next',
    '  next         -> the CLI still needs to choose bootstrap, recovery, or workflow continuation',
    '  pay          -> the wallet is ready and you want the flagship proof path now',
    '  submit       -> you want to capture one Agent Pay request now',
    '  suite        -> wallet readiness is clear and the question is broader than one immediate send',
    '  workspace    -> you already know you need the current Agent Pay workbench anchor',
    '  payment      -> execution is no longer the whole story and you need the Agent Pay request layer or workbench',
    '  relay baseline -> the browser is remote and approval must move to the hosted fallback path',
    '',
    'Three public proof paths:',
    '  flagship pay:',
    '    zk-agent pay --wallet main --to <address> --amount <amount>',
    '    zk-agent workflow next --request-id <id>',
    '    zk-agent workflow status --request-id <id>',
  '  Agent Pay requests:',
    `    ${buildSubmitRecommendedCommand('main')}`,
    '    zk-agent payment next --request-id <id>',
    '    zk-agent payment approval --request-id <id>',
    '    zk-agent workspace',
    '    zk-agent payment handoff --request-id <id>',
    '    zk-agent payment feed',
    '  hosted approval recovery:',
    '    zk-agent relay baseline --relay-url <url>',
    '    zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code',
    '    zk-agent wallet status --name main',
    '',
    'Open these only when the default path is no longer the whole question:',
    '  zk-agent suite',
    `  ${buildSubmitRecommendedCommand('main')}`,
    '  zk-agent workspace',
    '  zk-agent suite --include-onboarding',
    '  zk-agent doctor',
    '  zk-agent next --request-id <id>',
    '  zk-agent wallet --help',
    '  zk-agent workflow --help',
    '  zk-agent relay baseline --relay-url <url>',
    '  zk-agent wallet create|reapprove --relay-url <url> --wait-relay --prompt-code',
    '',
    'Validated first-run baseline:',
    '  setup defaults to zksync-sepolia and the local connector at http://localhost:4444',
    '  Override those only when you intentionally target a different chain or connector deployment.',
    '',
    'No custom .env is required for setup, next, or wallet create/reapprove request generation.',
    'Add RPC env vars later, before live reads or broadcasts.',
    'Use remote approval only when the browser is on another machine or cannot return to this terminal.'
  ].join('\n');
}

const ROOT_HELP_COMMAND_ORDER = [
  'start',
  'next',
  'pay',
  'submit',
  'doctor',
  'init',
  'wallet',
  'workflow',
  'suite',
  'workspace',
  'payment',
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
      'Local-first zkSync-native CLI for wallet approval, flagship pay execution, Agent Pay request routing, and single-host hosted relay recovery'
    )
    .showHelpAfterError()
    .option('--json', 'Force JSON output for agent harnesses', false)
    .hook('preAction', (thisCommand) => {
      if (thisCommand.optsWithGlobals().json) process.env.ZK_AGENT_OUTPUT = 'json';
    });

  program.addCommand(createInitCommand());
  program.addCommand(createStartCommand());
  program.addCommand(createNextCommand());
  program.addCommand(createPayCommand());
  program.addCommand(createSubmitCommand());
  program.addCommand(createDoctorCommand());
  program.addCommand(createAgentCommand());
  program.addCommand(createDefaultsCommand());
  program.addCommand(createSuiteCommand());
  program.addCommand(createWorkspaceCommand());
  program.addCommand(createPaymentCommand());
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
