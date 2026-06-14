import { Command, CommanderError } from 'commander';
import { config as loadEnv } from 'dotenv';

import {
  createBalancesCommand,
  createCallCommand,
  createFundCommand,
  createPlannedCommands,
  createSendCommand,
  createSendTokenCommand
} from './commands/operations.js';
import { createInitCommand } from './commands/setup.js';
import { createWalletCommand } from './commands/wallet.js';
import { formatErrorMessage, formatErrorPayload, jsonOut, shouldJsonOutput } from './lib/io.js';

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
  program.addCommand(createBalancesCommand());
  program.addCommand(createFundCommand());
  program.addCommand(createSendCommand());
  program.addCommand(createSendTokenCommand());
  program.addCommand(createCallCommand());

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

    const message = formatErrorMessage(error);
    if (shouldJsonOutput()) {
      jsonOut(formatErrorPayload(error));
    } else {
      process.stderr.write(`${message}\n`);
    }

    process.exitCode = 1;
  }
}
