import assert from 'node:assert/strict';
import test from 'node:test';

import { loadValidatedDefaults } from '@zk-agent/agent-core';

import { buildDefaultsLines } from '../src/commands/defaults.ts';

function lineValue(lines: Array<[string, string]>, label: string): string | undefined {
  return lines.find(([key]) => key === label)?.[1];
}

function lineValues(lines: Array<[string, string]>, label: string): string[] {
  return lines.filter(([key]) => key === label).map(([, value]) => value);
}

test('buildDefaultsLines exposes resolved breadth across supported, experimental, and mode-aware paymaster groups', () => {
  const lines = buildDefaultsLines({
    defaults: loadValidatedDefaults(),
    localTokenRegistry: [],
    tokenRegistrySources: [],
    tokenDirectoryChains: []
  });

  assert.equal(lineValue(lines, 'resolved supported swap count'), '1');
  assert.deepEqual(lineValues(lines, 'resolved supported swap'), [
    'uniswap-v3-exact-input-single (supported, manual)'
  ]);
  assert.equal(lineValue(lines, 'resolved experimental swap count'), '0');

  assert.equal(lineValue(lines, 'resolved supported bridge count'), '0');
  assert.equal(lineValue(lines, 'resolved experimental bridge count'), '0');

  assert.equal(lineValue(lines, 'paymaster matrix none default'), 'zksync-sepolia-no-paymaster');
  assert.equal(lineValue(lines, 'resolved supported paymaster count'), '0');
  assert.equal(lineValue(lines, 'resolved validated none paymaster count'), '1');
  assert.deepEqual(lineValues(lines, 'resolved validated none paymaster'), [
    'zksync-sepolia-no-paymaster (validated, none)'
  ]);
  assert.deepEqual(lineValues(lines, 'resolved validated paymaster'), [
    'zksync-sepolia-no-paymaster (validated, none)',
    'zksync-sepolia-sponsored (validated, sponsored)',
    'zksync-sepolia-approval-based-eravm (validated, approval-based)'
  ]);
  assert.equal(lineValue(lines, 'resolved experimental paymaster count'), '1');
  assert.deepEqual(lineValues(lines, 'resolved experimental paymaster'), [
    'zksync-sepolia-approval-based-evm-interpreter (experimental, approval-based)'
  ]);
  assert.equal(lineValue(lines, 'resolved validated sponsored paymaster count'), '1');
  assert.deepEqual(lineValues(lines, 'resolved validated sponsored paymaster'), [
    'zksync-sepolia-sponsored (validated, sponsored)'
  ]);
  assert.equal(lineValue(lines, 'resolved validated approval paymaster count'), '1');
  assert.deepEqual(lineValues(lines, 'resolved validated approval paymaster'), [
    'zksync-sepolia-approval-based-eravm (validated, approval-based)'
  ]);
});
