# SED Lite Profile

`sed-lite` is the current general-purpose AA base profile in this repository.

It is explicitly inspired by the `clave-contracts` account shape, but it is not
a byte-for-byte port.

## Why We Did Not Copy Clave Whole

The full Clave stack assumes more than this repository currently supports:

- proxy-based account deployment
- dedicated factory + registry lifecycle
- validator-encoded custom signatures
- richer hook and module initialization flows

Our current CLI and provider already know how to do one thing reliably:

- deploy a single zkSync-compatible account artifact
- sign native AA transactions with raw ECDSA owner keys
- send self-calls through the existing write path

So `sed-lite` keeps the parts that improve the AA architecture now, without
forcing a full wallet-stack rewrite first.

## What `sed-lite` Keeps From Clave

- account core stays focused on AA lifecycle:
  - validation
  - execution
  - fee payment
  - paymaster preparation
- signature validation now lives behind a dedicated K1 validator contract
  instead of hardcoded `ecrecover` inside the account
- owner changes are explicit self-calls
- modules are explicit account state instead of ad-hoc contract branches
- module execution is a first-class path
- batched execution exists as a built-in account capability

## What `sed-lite` Deliberately Simplifies

 - constructor is still `Account(address owner)`
 - signature format is still raw ECDSA bytes, not validator-address encoded custom payloads
 - the owner model is still a single K1 owner, not Clave's richer multi-owner manager
 - deployment is direct account deployment, not proxy + initializer through a custom factory
 - modules are simple enabled addresses for now
 - upgrade managers are deferred
 - hook pipelines are intentionally minimal for now:
  - validation hooks only
  - no validator-encoded hook data
  - no execution-hook context store yet

## Operational Commands

```bash
node packages/zk-agent-cli/dist/index.js wallet smart-account profiles
node packages/zk-agent-cli/dist/index.js wallet smart-account predict --name <wallet> --profile sed-lite
node packages/zk-agent-cli/dist/index.js wallet smart-account deploy --name <wallet> --profile sed-lite

node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite owner --name <wallet>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite owner-set --name <wallet> --address <owner> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite validator --name <wallet>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite validator-set --name <wallet> --address <validator> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite module --name <wallet> --module <module>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite module-add --name <wallet> --module <module> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite module-remove --name <wallet> --module <module> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite hooks --name <wallet>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite hook --name <wallet> --hook <hook>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite hook-add --name <wallet> --hook <hook> --init-data 0x... --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite hook-remove --name <wallet> --hook <hook> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite limit --name <wallet>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite limit-set --name <wallet> --amount 0.00005 --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite limit-remove --name <wallet> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite native-cap-hook show --name <wallet> --hook <hook>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite native-cap-hook enable --name <wallet> --hook <hook> --amount 0.00005 --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite native-cap-hook set --name <wallet> --hook <hook> --amount 0.00005 --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite native-cap-hook remove --name <wallet> --hook <hook> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite native-cap-hook disable --name <wallet> --hook <hook> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite target-allowlist-hook show --name <wallet> --hook <hook>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite target-allowlist-hook target --name <wallet> --hook <hook> --target <target>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite target-allowlist-hook enable --name <wallet> --hook <hook> --target <target> --target <target> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite target-allowlist-hook add --name <wallet> --hook <hook> --target <target> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite target-allowlist-hook remove --name <wallet> --hook <hook> --target <target> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite target-allowlist-hook disable --name <wallet> --hook <hook> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook show --name <wallet> --hook <hook>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook target --name <wallet> --hook <hook> --target <target>
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook selector --name <wallet> --hook <hook> --target <target> --selector 0xa9059cbb
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook enable --name <wallet> --hook <hook> --target <target> --selector-rule <target>:0xa9059cbb --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook target-add --name <wallet> --hook <hook> --target <target> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook target-remove --name <wallet> --hook <hook> --target <target> --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook selector-add --name <wallet> --hook <hook> --target <target> --selector 0xa9059cbb --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook selector-remove --name <wallet> --hook <hook> --target <target> --selector 0xa9059cbb --broadcast
node packages/zk-agent-cli/dist/index.js wallet smart-account sed-lite selector-allowlist-hook disable --name <wallet> --hook <hook> --broadcast
```

## Minimal Hook Layer

`sed-lite` now has a minimal Clave-inspired validation-hook pipeline.

What that means in this repository:

- the account can keep its authentication and execution core stable
- policy contracts can now be attached or removed through self-calls
- hook contracts evaluate normal owner-driven transactions during validation

The first hook contract is `NativePerTxLimitHook`.

The second hook contract now implemented locally is `TargetAllowlistHook`.

The third hook contract now implemented locally is `TargetSelectorAllowlistHook`.

What it does:

- stores per-account state inside the hook contract
- rejects native transfers above a configured per-transaction cap
- avoids `block.timestamp`, so it stays compatible with the EraVM validation
  restriction that blocked the old `daily-spend-limit` path
- can restrict an account to an explicit allowlist of destination addresses
- can separately restrict contract calls to explicit `(target, selector)` pairs
- always preserves self-calls to the account so owner rotation, module toggles,
  and hook management remain possible

What it does not do yet:

- daily windows
- execution hooks
- hook-specific signed payloads
- generic module-triggered hook installation flows

## Current Migration Step

The first concrete extraction from `clave-contracts` is now the validator
boundary, not a full manager-by-manager port.

What changed locally:

- `sed-lite` no longer keeps secp256k1 recovery logic hardcoded in the account
  core
- the account now boots with a dedicated `EOAValidator`
- validator rotation is a self-call, just like owner rotation and module toggles
- the account internals are now split into lightweight `Auth`, `OwnerManager`,
  `ValidatorManager`, `ModuleManager`, and `ValidationHookManager` layers
- that split preserves the current ABI, but removes the need to keep adding new
  AA features directly into one giant `Account.sol`

What is still intentionally deferred:

- multiple validators
- passkey / `secp256r1` validation
- owner-manager and validator-manager linked-list storage
- proxy/factory lifecycle and custom signature envelopes

## Live Validation Status

The base `sed-lite` path is now live-validated on `zkSync Sepolia`.

What has been confirmed:

- profile-based `predict` works
- profile-based `deploy` works
- onchain owner reads work
- onchain native cap reads work
- funded native transfers from the deployed smart account work
- setting a native per-transaction cap through a self-call works
- an over-cap native transfer is rejected during validation
- a below-cap native transfer still succeeds
- `NativePerTxLimitHook` deploys as a standalone EraVM contract
- a fresh hook-capable `sed-lite` deployment can list enabled hooks onchain
- enabling `NativePerTxLimitHook` through a self-call works
- hook state reads work against the deployed hook contract
- an over-cap native transfer is rejected during validation with the hook-specific error
- a below-cap native transfer still succeeds with the hook enabled
- a below-cap transaction also succeeds through the approval-based paymaster path
- an over-cap transaction on the approval-based paymaster path is rejected during
  fee estimation with the same hook-specific validation reason

Why this matters:

- the cap check no longer depends on `block.timestamp`
- that avoids the `SystemContext` restriction that blocked the old
  `daily-spend-limit` validation path
- this gives the repository one real EraVM-safe account-policy hook to build on

The new minimal hook layer is now also live-validated on `zkSync Sepolia`.

`TargetAllowlistHook` is now also live-validated on `zkSync Sepolia`.

What has been confirmed for it:

- the hook can be enabled through a smart-account self-call
- the allowlisted target set can be read back onchain
- a transfer to the allowlisted `paymaster-eoa` recipient succeeds
- a transfer to a non-allowlisted recipient is rejected during account
  validation with `Target is not allowlisted`

`TargetSelectorAllowlistHook` is now also live-validated on `zkSync Sepolia`.

What has been confirmed for it:

- the hook can be enabled through a smart-account self-call
- the configured `(target, selector)` rule can be read back onchain
- an allowlisted selector call succeeds, validated with ERC-20
  `approve(address,uint256)`
- a non-allowlisted selector call to the same target is rejected during account
  validation with `Target selector is not allowlisted`

Validated addresses in the current workspace:

- deployed hook: `0xC709133f19aEaa635492c000795f8f274d13aE22`
- fresh hook-capable account: `0x60E5E483DC4315f3db1185aF08499ce9a4C862CE`

One deployment caveat is now confirmed:

- older `sed-lite` accounts that were deployed before hook support was added do
  not expose the new hook methods
- the CLI now tells you to redeploy instead of returning a raw decode failure
- the same redeploy rule applies to the new validator read path, because older
  deployments do not expose `validator()`

## Why This Is Better Than `daily-spend-limit` As A Base

`daily-spend-limit` tries to make account core and policy core the same thing.

That is exactly what hurt us on EraVM:

- if the policy runs in validation, time-based state touches `SystemContext`
- if the policy runs in execution, it is too late to treat it as inclusion-time
  authorization

`sed-lite` avoids that trap by moving the repository toward a cleaner split:

- account core for authentication and execution
- policy logic layered on top later

That is the direction we should keep pushing.
