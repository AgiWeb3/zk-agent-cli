import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  LocalTokenRegistry,
  listLocalTokenRegistryEntries,
  resolveLocalTokenRegistryEntryBySymbol
} from '@zk-agent/agent-core';

test('resolveLocalTokenRegistryEntryBySymbol maps a built-in chain id to the matching local token', () => {
  const deploymentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-registry-'));

  try {
    fs.writeFileSync(
      path.join(deploymentsDir, 'token-a.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'ZKAT',
        decimals: 18
      }),
      'utf8'
    );

    const entry = resolveLocalTokenRegistryEntryBySymbol(300, 'ZKAT', {
      deploymentsDir
    });

    assert.deepEqual(entry, {
      chainId: 300,
      chainKey: 'zksync-sepolia',
      symbol: 'ZKAT',
      address: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      decimals: 18,
      sourcePath: path.join(deploymentsDir, 'token-a.json')
    });
  } finally {
    fs.rmSync(deploymentsDir, { recursive: true, force: true });
  }
});

test('listLocalTokenRegistryEntries returns sorted chain-aware local tokens', () => {
  const deploymentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-registry-'));

  try {
    fs.writeFileSync(
      path.join(deploymentsDir, 'token-a.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xB0e40024ac1eC50416ab539AB533ce582080B886',
        symbol: 'BBB',
        decimals: 18
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(deploymentsDir, 'token-b.json'),
      JSON.stringify({
        network: 'zksync-era',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'AAA',
        decimals: 6
      }),
      'utf8'
    );

    const entries = listLocalTokenRegistryEntries(undefined, { deploymentsDir });

    assert.deepEqual(
      entries.map((entry) => `${entry.chainKey}:${entry.symbol}:${entry.decimals}`),
      ['zksync-sepolia:BBB:18', 'zksync-era:AAA:6']
    );
  } finally {
    fs.rmSync(deploymentsDir, { recursive: true, force: true });
  }
});

test('LocalTokenRegistry resolves symbols through the shared registry interface', async () => {
  const deploymentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-registry-'));

  try {
    fs.writeFileSync(
      path.join(deploymentsDir, 'token-a.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'ZKAT',
        decimals: 18
      }),
      'utf8'
    );

    const registry = new LocalTokenRegistry({ deploymentsDir });
    const entry = await registry.resolveBySymbol(300, 'zkat');

    assert.equal(entry?.chainKey, 'zksync-sepolia');
    assert.equal(entry?.symbol, 'ZKAT');
    assert.equal(entry?.decimals, 18);
  } finally {
    fs.rmSync(deploymentsDir, { recursive: true, force: true });
  }
});
