import { Command, CommanderError } from 'commander';
import { config as loadEnv } from 'dotenv';

import {
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
import { createWalletCommand } from './commands/wallet.js';
import { createWorkflowCommand } from './commands/workflow.js';
import {
  formatErrorPayload,
  formatHumanErrorMessage,
  jsonOut,
  shouldJsonOutput
} from './lib/io.js';

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
  program.addCommand(createWalletCommand());
  program.addCommand(createWorkflowCommand());
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
