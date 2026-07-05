import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  discoverDefaultTokenRegistry,
  describeDefaultTokenRegistrySources,
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
      sourcePath: path.join(deploymentsDir, 'token-a.json'),
      source: 'local-deployments'
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
    const entries = await registry.findBySymbol(300, 'zkat');
    const entry = entries[0];

    assert.equal(entry?.chainKey, 'zksync-sepolia');
    assert.equal(entry?.symbol, 'ZKAT');
    assert.equal(entry?.decimals, 18);
  } finally {
    fs.rmSync(deploymentsDir, { recursive: true, force: true });
  }
});

test('describeDefaultTokenRegistrySources reflects the optional token-directory source', () => {
  const tokenDirectoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-directory-'));
  const previousTokenDirectoryRoot = process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;

  try {
    process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = tokenDirectoryRoot;

    const sources = describeDefaultTokenRegistrySources();
    const localSource = sources.find((entry) => entry.id === 'local-deployments');
    const tokenDirectorySource = sources.find((entry) => entry.id === 'token-directory');

    assert.equal(localSource?.enabled, true);
    assert.equal(tokenDirectorySource?.enabled, true);
    assert.equal(tokenDirectorySource?.exists, true);
    assert.equal(tokenDirectorySource?.path, tokenDirectoryRoot);
  } finally {
    if (previousTokenDirectoryRoot === undefined) {
      delete process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT;
    } else {
      process.env.ZK_AGENT_TOKEN_DIRECTORY_ROOT = previousTokenDirectoryRoot;
    }
    fs.rmSync(tokenDirectoryRoot, { recursive: true, force: true });
  }
});

test('discoverDefaultTokenRegistry merges local-first entries across sources for discovery', async () => {
  const deploymentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-registry-'));
  const tokenDirectoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-directory-'));

  try {
    fs.writeFileSync(
      path.join(deploymentsDir, 'token-a.json'),
      JSON.stringify({
        network: 'zksync-sepolia',
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'USDC',
        decimals: 6
      }),
      'utf8'
    );
    fs.mkdirSync(path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia'), { recursive: true });
    fs.writeFileSync(
      path.join(tokenDirectoryRoot, 'index', 'index.json'),
      JSON.stringify({
        index: {
          'zksync-sepolia': {
            chainId: 300,
            tokenLists: {
              'erc20.json': 'mock'
            }
          }
        }
      }),
      'utf8'
    );
    fs.writeFileSync(
      path.join(tokenDirectoryRoot, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
            symbol: 'USDC',
            decimals: 6
          },
          {
            chainId: 300,
            address: '0xB0e40024ac1eC50416ab539AB533ce582080B886',
            symbol: 'USDT',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    const result = await discoverDefaultTokenRegistry({
      chainId: 300,
      deploymentsDir,
      tokenDirectoryRoot
    });

    assert.equal(result.entryCount, 2);
    assert.deepEqual(
      result.entries.map((entry) => `${entry.symbol}:${entry.address}:${entry.source}`),
      [
        'USDC:0xa0e40024ac1ec50416ab539ab533ce582080b885:local-deployments',
        'USDT:0xb0e40024ac1ec50416ab539ab533ce582080b886:token-directory'
      ]
    );
  } finally {
    fs.rmSync(deploymentsDir, { recursive: true, force: true });
    fs.rmSync(tokenDirectoryRoot, { recursive: true, force: true });
  }
});
