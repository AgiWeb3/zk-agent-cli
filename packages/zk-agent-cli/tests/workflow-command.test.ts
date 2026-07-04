import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBridgeCommand,
  createDepositCommand,
  createFundCommand,
  createSendTokenCommand,
  createSwapCommand,
  createWithdrawCommand
} from '../src/commands/operations.ts';
import { createWorkflowCommand } from '../src/commands/workflow.ts';

test('workflow command exposes fund and auto as first-class subcommands', () => {
  const workflow = createWorkflowCommand();
  const names = workflow.commands.map((command) => command.name());

  assert.ok(names.includes('fund'));
  assert.ok(names.includes('auto'));
});

test('bridge command help marks to-chain as optional when a tracked default route exists', () => {
  const bridge = createBridgeCommand();
  const help = bridge.helpInformation();

  assert.match(
    help,
    /--to-chain <chain>[\s\S]*Destination chain key or id\. Optional when the[\s\S]*tracked default bridge route/
  );
});

test('send-token command help marks token as optional when symbol can resolve locally', () => {
  const command = createSendTokenCommand();
  const help = command.helpInformation();

  assert.match(
    help,
    /--token <address>[\s\S]*Optional when[\s\S]*--symbol resolves from local deployment records/
  );
  assert.match(
    help,
    /--symbol <symbol>[\s\S]*Also used for local[\s\S]*deployment lookup when --token is omitted/
  );
});

test('swap command help marks token addresses as optional when symbols resolve locally', () => {
  const command = createSwapCommand();
  const help = command.helpInformation();

  assert.match(
    help,
    /--token-in <address>[\s\S]*Optional[\s\S]*--token-in-symbol resolves from local[\s\S]*deployment records/
  );
  assert.match(
    help,
    /--token-out <address>[\s\S]*Optional[\s\S]*--token-out-symbol resolves from local[\s\S]*deployment records/
  );
});

test('fund, deposit, and withdraw help mark token addresses as optional when symbols resolve locally', () => {
  const fundHelp = createFundCommand().helpInformation();
  const depositHelp = createDepositCommand().helpInformation();
  const withdrawHelp = createWithdrawCommand().helpInformation();

  assert.match(
    fundHelp,
    /--token <address>[\s\S]*Also optional when --symbol[\s\S]*resolves from local deployment records/
  );
  assert.match(
    depositHelp,
    /--token <address>[\s\S]*Omit for the native[\s\S]*token path or when --symbol resolves from local[\s\S]*deployment records/
  );
  assert.match(
    withdrawHelp,
    /--token <address>[\s\S]*Omit for the native[\s\S]*token path or when --symbol resolves from local[\s\S]*deployment records/
  );
});

test('workflow help marks send-token and swap token addresses as locally resolvable', () => {
  const workflow = createWorkflowCommand();
  const sendTokenHelp = workflow.commands.find((command) => command.name() === 'send-token')?.helpInformation();
  const swapHelp = workflow.commands.find((command) => command.name() === 'swap')?.helpInformation();
  const bridgeHelp = workflow.commands.find((command) => command.name() === 'bridge')?.helpInformation();
  const depositHelp = workflow.commands.find((command) => command.name() === 'deposit')?.helpInformation();
  const withdrawHelp = workflow.commands.find((command) => command.name() === 'withdraw')?.helpInformation();

  assert.ok(sendTokenHelp);
  assert.ok(swapHelp);
  assert.ok(bridgeHelp);
  assert.ok(depositHelp);
  assert.ok(withdrawHelp);
  assert.match(
    sendTokenHelp,
    /--token <address>[\s\S]*Optional when the[\s\S]*relevant symbol resolves from local[\s\S]*deployment records/
  );
  assert.match(
    swapHelp,
    /--token-in <address>[\s\S]*Optional[\s\S]*--token-in-symbol resolves from local[\s\S]*deployment records/
  );
  assert.match(
    swapHelp,
    /--token-out <address>[\s\S]*Optional[\s\S]*--token-out-symbol resolves from local[\s\S]*deployment records/
  );
  assert.match(
    bridgeHelp,
    /--token <address>[\s\S]*Optional when the[\s\S]*relevant symbol resolves from local[\s\S]*deployment records/
  );
  assert.match(
    depositHelp,
    /--token <address>[\s\S]*Optional when the[\s\S]*relevant symbol resolves from local[\s\S]*deployment records/
  );
  assert.match(
    withdrawHelp,
    /--token <address>[\s\S]*Optional when the[\s\S]*relevant symbol resolves from local[\s\S]*deployment records/
  );
});
