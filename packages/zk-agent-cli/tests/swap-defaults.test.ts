import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSwapCommandDefaults } from '../src/lib/swap-defaults.ts';

const savedEnv = {
  ZKSYNC_SWAP_ROUTER_ADDRESS: process.env.ZKSYNC_SWAP_ROUTER_ADDRESS,
  ZKSYNC_SWAP_FEE_TIER: process.env.ZKSYNC_SWAP_FEE_TIER,
  ZKSYNC_SYNCSWAP_ROUTER_ADDRESS: process.env.ZKSYNC_SYNCSWAP_ROUTER_ADDRESS,
  ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS: process.env.ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test.afterEach(() => {
  restoreEnv();
});

test('resolveSwapCommandDefaults keeps explicit uniswap settings', () => {
  delete process.env.ZKSYNC_SWAP_ROUTER_ADDRESS;
  delete process.env.ZKSYNC_SWAP_FEE_TIER;

  const resolved = resolveSwapCommandDefaults({
    protocol: 'uniswap-v3-exact-input-single',
    router: '0x1111111111111111111111111111111111111111',
    feeTier: '500'
  });

  assert.deepEqual(resolved, {
    protocol: 'uniswap-v3-exact-input-single',
    routerAddress: '0x1111111111111111111111111111111111111111',
    factoryAddress: undefined,
    feeTier: 500
  });
});

test('resolveSwapCommandDefaults fills syncswap router and factory from tracked defaults', () => {
  delete process.env.ZKSYNC_SYNCSWAP_ROUTER_ADDRESS;
  delete process.env.ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS;

  const resolved = resolveSwapCommandDefaults({
    protocol: 'syncswap-classic'
  });

  assert.equal(resolved.protocol, 'syncswap-classic');
  assert.equal(resolved.routerAddress, '0x3f39129e54d2331926c1E4bf034e111cf471AA97');
  assert.equal(resolved.factoryAddress, '0x5FeE4bbc7000b57CE246fd5d8E392099F65f5e09');
  assert.equal(resolved.feeTier, 0);
});

test('resolveSwapCommandDefaults lets env override tracked syncswap defaults', () => {
  process.env.ZKSYNC_SYNCSWAP_ROUTER_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  process.env.ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  const resolved = resolveSwapCommandDefaults({
    protocol: 'syncswap-classic'
  });

  assert.equal(resolved.routerAddress, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(resolved.factoryAddress, '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
});
