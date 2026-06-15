# Daily Spend Limit Profile

`daily-spend-limit` is now the first built-in AA profile in this repository.

It is not treated as a universal zkSync account standard. It is treated as a
concrete, inspectable starting point for the AA part of `zk-agent-cli`.

## Why This Profile

- it already implements zkSync native `IAccount`
- it uses a plain ECDSA owner model, which matches our current local-session
  assumptions
- it includes a real policy module instead of a bare "smart account shell"
- it is much easier to reason about than multisig or WebAuthn as a first pass

## What We Inherit

- `Account.sol` as the actual account implementation target
- `SpendLimit.sol` as the first policy module
- `AAFactory.sol` as a reference deployment helper from the community example

## What We Deliberately Change

- we do not keep the tutorial's `1 minutes` reset window
- the checked-in source uses `24 hours`
- we do not make `AAFactory` a mandatory runtime dependency for the CLI
- the CLI deploy path continues to use the generic provider deployment layer,
  which already speaks `createAccount` / `create2Account`

## Important Boundaries

- current constructor shape is `Account(address owner)`
- the recommended default deployment mode is `create2Account`
- the current profile metadata uses zero salt as the default deterministic
  first-pass value
- the spend-limit logic only guards native-token `value` spending
- it does not currently inspect ERC-20 calldata and enforce token-specific
  spend limits during token transfers

That last point matters: this profile is useful as a real AA starting point,
but it is not yet a complete "agent treasury policy engine".

## Current Repository State

- the profile is registered in `packages/account-profiles`
- the Solidity source is checked in under
  `packages/account-profiles/contracts/daily-spend-limit`
- the CLI exposes `wallet smart-account profiles`
- `wallet smart-account predict|deploy` now accepts `--profile daily-spend-limit`
- the repository now includes a local EraVM compile path via
  `pnpm --filter @zk-agent/account-profiles compile:eravm`
- the compiled artifact remains a local generated file and is not checked in

Until `packages/account-profiles/artifacts/daily-spend-limit/Account.json`
exists, the CLI will report this profile as `source-only` and refuse actual
predict/deploy calls with a clear error.

## Why This Is Still Useful Right Now

Even before the artifact is compiled, this gives us three things we did not
have before:

- a stable first-party AA profile registry
- a product-level decision about the first concrete account shape
- a clean separation between generic deployment plumbing and profile-specific
  account recipes

That separation is what we need before adding the next AA profiles.
