import test from 'node:test';
import assert from 'node:assert/strict';

import { listBuiltinChains, resolveChain } from '../src/chains.js';

test('resolveChain applies RPC URL override from environment', () => {
  const previous = process.env.ZKSYNC_SEPOLIA_RPC_URL;
  process.env.ZKSYNC_SEPOLIA_RPC_URL = 'https://rpc.example.invalid/zksync-sepolia';

  try {
    const chain = resolveChain('zksync-sepolia');
    assert.equal(chain.rpcUrl, 'https://rpc.example.invalid/zksync-sepolia');
  } finally {
    if (previous === undefined) {
      delete process.env.ZKSYNC_SEPOLIA_RPC_URL;
    } else {
      process.env.ZKSYNC_SEPOLIA_RPC_URL = previous;
    }
  }
});

test('listBuiltinChains returns overridden RPC URL without mutating builtin defaults', () => {
  const previous = process.env.ZKSYNC_SEPOLIA_RPC_URL;
  process.env.ZKSYNC_SEPOLIA_RPC_URL = 'https://rpc.example.invalid/zksync-sepolia';

  try {
    const listed = listBuiltinChains();
    const sepolia = listed.find((chain) => chain.key === 'zksync-sepolia');
    assert.equal(sepolia?.rpcUrl, 'https://rpc.example.invalid/zksync-sepolia');

    delete process.env.ZKSYNC_SEPOLIA_RPC_URL;
    const reset = resolveChain('zksync-sepolia');
    assert.equal(reset.rpcUrl, 'https://sepolia.era.zksync.dev');
  } finally {
    if (previous === undefined) {
      delete process.env.ZKSYNC_SEPOLIA_RPC_URL;
    } else {
      process.env.ZKSYNC_SEPOLIA_RPC_URL = previous;
    }
  }
});
