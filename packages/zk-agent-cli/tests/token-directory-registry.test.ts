import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { listTokenDirectoryIndexedChains, TokenDirectoryRegistry } from '@zk-agent/agent-core';

test('TokenDirectoryRegistry prefers verified matches and resolves addresses for the active chain', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-directory-'));

  try {
    fs.mkdirSync(path.join(rootDir, 'index', 'zksync-sepolia'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, 'index', 'index.json'),
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
      path.join(rootDir, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({
        tokens: [
          {
            chainId: 300,
            address: '0x3333333333333333333333333333333333333333',
            symbol: 'USDC',
            decimals: 6
          },
          {
            chainId: 300,
            address: '0x1111111111111111111111111111111111111111',
            symbol: 'USDC',
            decimals: 6,
            extensions: {
              verified: true
            }
          }
        ]
      }),
      'utf8'
    );

    const registry = new TokenDirectoryRegistry({ rootDir });
    const matches = await registry.findBySymbol(300, 'usdc');
    const byAddress = await registry.resolveByAddress(
      300,
      '0x1111111111111111111111111111111111111111'
    );

    assert.equal(matches.length, 2);
    assert.equal(matches[0]?.address, '0x1111111111111111111111111111111111111111');
    assert.equal(matches[0]?.source, 'token-directory');
    assert.equal(byAddress?.symbol, 'USDC');
    assert.equal(byAddress?.decimals, 6);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('listTokenDirectoryIndexedChains reports built-in zkSync chain coverage from the local index', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-directory-'));

  try {
    fs.mkdirSync(path.join(rootDir, 'index', 'zksync-sepolia'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, 'index', 'index.json'),
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
      path.join(rootDir, 'index', 'zksync-sepolia', 'erc20.json'),
      JSON.stringify({ tokens: [] }),
      'utf8'
    );

    const chains = await listTokenDirectoryIndexedChains({ rootDir });

    assert.deepEqual(chains, [
      {
        chainName: 'zksync-sepolia',
        chainId: 300,
        chainKey: 'zksync-sepolia',
        hasErc20List: true,
        tokenListPath: path.join('index', 'zksync-sepolia', 'erc20.json')
      }
    ]);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
