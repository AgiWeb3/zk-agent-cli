import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveLocalTokenMetadata } from '../src/lib/local-token-metadata.ts';

test('resolveLocalTokenMetadata returns symbol and decimals from a matching deployment record', () => {
  const deploymentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-meta-'));

  try {
    fs.writeFileSync(
      path.join(deploymentsDir, 'token-a.json'),
      JSON.stringify({
        contractAddress: '0xA0e40024ac1eC50416ab539AB533ce582080B885',
        symbol: 'ZKAT',
        decimals: 18
      }),
      'utf8'
    );

    const result = resolveLocalTokenMetadata('0xA0e40024ac1eC50416ab539AB533ce582080B885', {
      deploymentsDir
    });

    assert.deepEqual(result, {
      address: '0xa0e40024ac1ec50416ab539ab533ce582080b885',
      symbol: 'ZKAT',
      decimals: 18,
      sourcePath: path.join(deploymentsDir, 'token-a.json')
    });
  } finally {
    fs.rmSync(deploymentsDir, { recursive: true, force: true });
  }
});

test('resolveLocalTokenMetadata ignores records without token metadata', () => {
  const deploymentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-agent-token-meta-'));

  try {
    fs.writeFileSync(
      path.join(deploymentsDir, 'paymaster.json'),
      JSON.stringify({
        contractAddress: '0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97',
        contractName: 'ManagedPaymaster'
      }),
      'utf8'
    );

    const result = resolveLocalTokenMetadata('0x6AF9771e57854BD9aC07fa66034F71F6d90a3F97', {
      deploymentsDir
    });

    assert.equal(result, undefined);
  } finally {
    fs.rmSync(deploymentsDir, { recursive: true, force: true });
  }
});
