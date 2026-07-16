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

function normalizeHelp(help: string): string {
  return help.replace(/\s+/g, ' ').trim();
}

test('workflow command exposes fund and auto as first-class subcommands', () => {
  const workflow = createWorkflowCommand();
  const names = workflow.commands.map((command) => command.name());

  assert.ok(names.includes('fund'));
  assert.ok(names.includes('auto'));
});

test('bridge command help marks to-chain as optional when a tracked default route exists', () => {
  const bridge = createBridgeCommand();
  const help = normalizeHelp(bridge.helpInformation());

  assert.equal(
    help.includes(
      '--to-chain <chain> Destination chain key or id. Optional when the current chain has a tracked default bridge route'
    ),
    true
  );
});

test('send-token command help marks token as optional when symbol can resolve locally', () => {
  const command = createSendTokenCommand();
  const help = normalizeHelp(command.helpInformation());

  assert.equal(
    help.includes(
      '--token <address> ERC-20 token contract address. Optional when --symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    help.includes(
      '--symbol <symbol> Token symbol for display. Also used for token-registry lookup when --token is omitted'
    ),
    true
  );
});

test('swap command help marks token addresses as optional when symbols resolve locally', () => {
  const command = createSwapCommand();
  const help = normalizeHelp(command.helpInformation());

  assert.equal(
    help.includes(
      '--token-in <address> Input ERC-20 token contract address. Optional when --token-in-symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    help.includes(
      '--token-out <address> Output ERC-20 token contract address. Optional when --token-out-symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    help.includes(
      '--protocol <protocol> Optional swap protocol override: uniswap-v3-exact-input-single or syncswap-classic. Defaults to the current registry-backed validated swap path'
    ),
    true
  );
});

test('fund, deposit, and withdraw help mark token addresses as optional when symbols resolve locally', () => {
  const fundHelp = normalizeHelp(createFundCommand().helpInformation());
  const depositHelp = normalizeHelp(createDepositCommand().helpInformation());
  const withdrawHelp = normalizeHelp(createWithdrawCommand().helpInformation());

  assert.equal(
    fundHelp.includes(
      '--token <address> Optional token address to embed into the suggested funding commands. Also optional when --symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    depositHelp.includes(
      '--token <address> L1 token contract address. Omit for the native token path or when --symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    withdrawHelp.includes(
      '--token <address> L2 token contract address. Omit for the native token path or when --symbol resolves from the configured token registry'
    ),
    true
  );
});

test('workflow help marks send-token and swap token addresses as locally resolvable', () => {
  const workflow = createWorkflowCommand();
  const sendTokenHelp = normalizeHelp(
    workflow.commands.find((command) => command.name() === 'send-token')?.helpInformation() || ''
  );
  const swapHelp = normalizeHelp(
    workflow.commands.find((command) => command.name() === 'swap')?.helpInformation() || ''
  );
  const bridgeHelp = normalizeHelp(
    workflow.commands.find((command) => command.name() === 'bridge')?.helpInformation() || ''
  );
  const depositHelp = normalizeHelp(
    workflow.commands.find((command) => command.name() === 'deposit')?.helpInformation() || ''
  );
  const withdrawHelp = normalizeHelp(
    workflow.commands.find((command) => command.name() === 'withdraw')?.helpInformation() || ''
  );

  assert.ok(sendTokenHelp);
  assert.ok(swapHelp);
  assert.ok(bridgeHelp);
  assert.ok(depositHelp);
  assert.ok(withdrawHelp);
  assert.equal(
    sendTokenHelp.includes(
      '--token <address> Token address for send-token, bridge, deposit, or withdraw. Optional when the relevant symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    swapHelp.includes(
      '--token-in <address> Swap input token address. Optional when --token-in-symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    swapHelp.includes(
      '--token-out <address> Swap output token address. Optional when --token-out-symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    bridgeHelp.includes(
      '--token <address> Token address for send-token, bridge, deposit, or withdraw. Optional when the relevant symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    depositHelp.includes(
      '--token <address> Token address for send-token, bridge, deposit, or withdraw. Optional when the relevant symbol resolves from the configured token registry'
    ),
    true
  );
  assert.equal(
    withdrawHelp.includes(
      '--token <address> Token address for send-token, bridge, deposit, or withdraw. Optional when the relevant symbol resolves from the configured token registry'
    ),
    true
  );
});
