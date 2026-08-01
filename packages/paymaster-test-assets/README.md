# @zk-agent/paymaster-test-assets

This package is no longer only for deploying a test ERC-20.

It also carries the repository's local paymaster test assets:

- `StandardTestToken.sol`
  Can be compiled either through the standard `solc` + EVM Interpreter route
  or through `zksolc`, producing a native EraVM token for comparison against
  approval-based live validation.
- `ManagedPaymaster.sol`
  Uses the `hardhat-zksync` + `zksolc` route to produce a native EraVM
  paymaster.

## Why it is split this way

- The test token should be stable, cheap, and repeatedly deployable.
- The paymaster should match native zkSync EraVM behavior as closely as
  possible.
- Those two goals should not be forced through the same compilation path.

## Paymaster origin and upgrades

`ManagedPaymaster.sol` was not written from scratch.

It is an upgraded merge of two example families under `community-code/code`:

- the sponsored/general flow from `GeneralPaymaster`
- the approval-based flow from `ApprovalPaymaster`

On top of those examples, the repository adds several missing pieces:

- one paymaster can support both `general` and `approval-based`
- `approval-based` no longer blindly trusts the incoming `minAllowance`
- underquoted `minAllowance` during `zks_estimateFee` follows a
  `magic=0` estimation-friendly branch so estimation does not deadlock on a
  circular dependency with `gasLimit`
- real token charges are computed from `requiredETH` and the configured rate
- the owner can update token, rate, and flow toggles
- the owner can withdraw ETH and collected fee tokens

## Commands

```bash
pnpm --filter @zk-agent/paymaster-test-assets compile
pnpm --filter @zk-agent/paymaster-test-assets deploy

pnpm --filter @zk-agent/paymaster-test-assets export:token-directory
pnpm --filter @zk-agent/paymaster-test-assets compile:eravm
pnpm --filter @zk-agent/paymaster-test-assets deploy:token:eravm
pnpm --filter @zk-agent/paymaster-test-assets deploy:paymaster
pnpm --filter @zk-agent/paymaster-test-assets deploy:pool:syncswap-classic
```

## Outputs

- ERC-20 artifact:
  `packages/paymaster-test-assets/artifacts/StandardTestToken.json`
- EraVM token artifact:
  `packages/paymaster-test-assets/artifacts/tokens/StandardTestToken.eravm.json`
- EraVM paymaster artifact:
  `packages/paymaster-test-assets/artifacts/paymasters/ManagedPaymaster.json`
- ERC-20 deployment:
  `packages/paymaster-test-assets/deployments/zksync-sepolia.latest.json`
- EraVM token deployment:
  `packages/paymaster-test-assets/deployments/zksync-sepolia.eravm-token.latest.json`
- paymaster deployment:
  `packages/paymaster-test-assets/deployments/zksync-sepolia.paymaster.latest.json`
- SyncSwap classic pool/liquidity record:
  `packages/paymaster-test-assets/deployments/zksync-sepolia.syncswap-classic.latest.json`
- local token-directory export:
  `packages/paymaster-test-assets/token-directory`

## Exporting a local token-directory

If you want `zk-agent-cli` to layer a local symbol-to-token-address directory
on top of deployment records, export the current deployment set in
token-directory format:

```bash
pnpm --filter @zk-agent/paymaster-test-assets export:token-directory
```

Default output path:

- `packages/paymaster-test-assets/token-directory`

Input and output directories can also be overridden:

```bash
node ./packages/paymaster-test-assets/scripts/export-token-directory.mjs \
  --deployments-dir ./packages/paymaster-test-assets/deployments \
  --out-dir ./packages/paymaster-test-assets/token-directory
```

After export, you can set the following in the root `.env`:

```bash
ZK_AGENT_TOKEN_DIRECTORY_ROOT=packages/paymaster-test-assets/token-directory
```

That lets `fund`, `send-token`, `swap`, `workflow ...`, `zk-agent tokens`, and
`zk-agent resolve-token` all reuse the same local token-directory.

## `.env` fields

Existing fields:

- `ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY`
- `ZKSYNC_SEPOLIA_WALLET_ADDRESS`
- `ZKSYNC_SEPOLIA_RPC_URL`
- `ZKSYNC_SEPOLIA_TEST_TOKEN`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_NAME`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SYMBOL`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_DECIMALS`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SUPPLY`

Additional paymaster fields:

- `ZKSYNC_SEPOLIA_PAYMASTER_TOKEN`
- `ZKSYNC_SEPOLIA_PAYMASTER_OWNER_ADDRESS`
- `ZKSYNC_SEPOLIA_PAYMASTER_FUNDING_ETH`
- `ZKSYNC_SEPOLIA_PAYMASTER_RATE_NUMERATOR`
- `ZKSYNC_SEPOLIA_PAYMASTER_RATE_DENOMINATOR`
- `ZKSYNC_SEPOLIA_PAYMASTER_ENABLE_GENERAL`
- `ZKSYNC_SEPOLIA_PAYMASTER_ENABLE_APPROVAL`

Additional SyncSwap classic fields:

- `ZKSYNC_SYNCSWAP_ROUTER_ADDRESS`
- `ZKSYNC_SYNCSWAP_CLASSIC_FACTORY_ADDRESS`
- `ZKSYNC_SYNCSWAP_CLASSIC_TOKEN_A`
- `ZKSYNC_SYNCSWAP_CLASSIC_TOKEN_B`
- `ZKSYNC_SYNCSWAP_CLASSIC_AMOUNT_A`
- `ZKSYNC_SYNCSWAP_CLASSIC_AMOUNT_B`
- `ZKSYNC_SYNCSWAP_CLASSIC_LP_RECIPIENT`

Default behavior:

- if `PAYMASTER_TOKEN` is unset, prefer `ZKSYNC_SEPOLIA_TEST_TOKEN`
- if `TEST_TOKEN` is also unset, fall back to the token address from the most
  recent `deploy` result
- the default rate is `1 / 1`
- both `general` and `approval-based` are enabled by default
- the SyncSwap classic pool script prefers:
  - `TOKEN_A = ZKSYNC_SEPOLIA_TEST_TOKEN` or the most recent EraVM token
    deployment
  - `TOKEN_B = the most recent EVM-interpreter token deployment`
  - default liquidity amounts of `1000` on both sides
  - LP tokens sent to `ZKSYNC_SEPOLIA_WALLET_ADDRESS` by default

## SyncSwap classic test pool

`deploy:pool:syncswap-classic` does not deploy a new contract. Its purpose is
to prepare a repeatable SyncSwap classic environment on zkSync Sepolia for this
repository's own test tokens:

- check whether the `classic factory` already has a pool
- if not, call `createPool(bytes)` to create one
- inspect router allowances for both tokens and auto-run `approve` if needed
- call `router.addLiquidity(...)` to seed two-sided liquidity
- record the latest pool address, liquidity transaction, LP balance, and
  current reserves in `zksync-sepolia.syncswap-classic.latest.json`

## Current Sepolia conclusion

- The EVM-interpreter version of the test token can make approval-based preview
  succeed.
- But it can still fail approval-based live broadcast because of
  `SystemContext` validation.
- When the same token logic is deployed as native EraVM bytecode and paired
  with the native EraVM `ManagedPaymaster`, approval-based live broadcast has
  already been confirmed to succeed in this repository.
