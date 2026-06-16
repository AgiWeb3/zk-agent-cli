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
- owner changes are explicit self-calls
- modules are explicit account state instead of ad-hoc contract branches
- module execution is a first-class path
- batched execution exists as a built-in account capability

## What `sed-lite` Deliberately Simplifies

- constructor is still `Account(address owner)`
- owner validation is direct ECDSA, not validator-address encoded signature payloads
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
```

## Minimal Hook Layer

`sed-lite` now has a minimal Clave-inspired validation-hook pipeline.

What that means in this repository:

- the account can keep its authentication and execution core stable
- policy contracts can now be attached or removed through self-calls
- hook contracts evaluate normal owner-driven transactions during validation

The first hook contract is `NativePerTxLimitHook`.

The second hook contract now implemented locally is `TargetAllowlistHook`.

What it does:

- stores per-account state inside the hook contract
- rejects native transfers above a configured per-transaction cap
- avoids `block.timestamp`, so it stays compatible with the EraVM validation
  restriction that blocked the old `daily-spend-limit` path
- can restrict an account to an explicit allowlist of destination addresses
- always preserves self-calls to the account so owner rotation, module toggles,
  and hook management remain possible

What it does not do yet:

- daily windows
- execution hooks
- hook-specific signed payloads
- generic module-triggered hook installation flows

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

Validated addresses in the current workspace:

- deployed hook: `0xC709133f19aEaa635492c000795f8f274d13aE22`
- fresh hook-capable account: `0x60E5E483DC4315f3db1185aF08499ce9a4C862CE`

One deployment caveat is now confirmed:

- older `sed-lite` accounts that were deployed before hook support was added do
  not expose the new hook methods
- the CLI now tells you to redeploy instead of returning a raw decode failure

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
