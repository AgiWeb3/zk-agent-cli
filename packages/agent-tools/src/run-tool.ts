import { readFile } from 'node:fs/promises';

import {
  createZkSyncAgentToolContext
} from './create-zksync-toolset.js';
import {
  listStandardAgentTools,
  runStandardAgentTool
} from './run-standard-tool.js';

interface RunToolOptions {
  list: boolean;
  toolName?: string;
  input?: unknown;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage:',
      '  pnpm --filter @zk-agent/agent-tools tool:run -- --list',
      '  pnpm --filter @zk-agent/agent-tools tool:run -- --tool <toolName> --input <json|@file>',
      '',
      'Examples:',
      '  pnpm --filter @zk-agent/agent-tools tool:run -- --list',
      '  pnpm --filter @zk-agent/agent-tools tool:run -- --tool walletStatusTool --input \'{"walletName":"paymaster-eoa"}\''
    ].join('\n') + '\n'
  );
}

function requireOptionValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

async function parseInput(value: string): Promise<unknown> {
  const raw = value.startsWith('@') ? await readFile(value.slice(1), 'utf8') : value;
  return JSON.parse(raw);
}

async function parseArgs(argv: string[]): Promise<RunToolOptions> {
  let list = false;
  let toolName: string | undefined;
  let input: unknown;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--list') {
      list = true;
      continue;
    }

    if (arg === '--tool') {
      toolName = requireOptionValue(argv, index, arg).trim();
      index += 1;
      continue;
    }

    if (arg === '--input') {
      input = await parseInput(requireOptionValue(argv, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!list && !toolName) {
    throw new Error('Pass --list or --tool <toolName>.');
  }

  if (toolName && input === undefined) {
    throw new Error('--input is required when --tool is provided.');
  }

  return {
    list,
    toolName,
    input
  };
}

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function main(): Promise<void> {
  const options = await parseArgs(process.argv.slice(2));
  const context = createZkSyncAgentToolContext();

  if (options.list) {
    writeJson({
      ok: true,
      tools: listStandardAgentTools(context)
    });
    return;
  }

  const result = await runStandardAgentTool(context, options.toolName as string, options.input);
  writeJson({
    ok: result.ok,
    toolName: options.toolName,
    result
  });

  if (!result.ok) {
    process.exitCode = 1;
  }
}

await main();
