# @zk-agent/account-profiles

This package hosts built-in zkSync smart-account profiles that `zk-agent-cli`
can recognize without forcing the user to manually wire every account artifact.

Current scope:

- `sed-lite`
- `daily-spend-limit`

Important boundary:

- the Solidity source is checked in here
- the zkSync EraVM artifact is generated locally and is git-ignored
- until the local exported artifact for a profile exists, the CLI will expose
  that profile as `source-only` and refuse deploy/predict with a clear error

Compile the local EraVM artifact with:

```bash
pnpm --filter @zk-agent/account-profiles compile:eravm
```

The Hardhat zkSync config for this package must keep
`zksolc.settings.enableEraVMExtensions = true`; without it, native smart-account
validation paths that touch zkSync system contracts can deploy successfully but
fail at runtime.

This writes:

- `artifacts-zk/` as the raw Hardhat zkSync output
- `artifacts/sed-lite/Account.json` as the minimal CLI-readable export
- `artifacts/sed-lite/NativePerTxLimitHook.json` as the first SED Lite policy-hook export
- `artifacts/daily-spend-limit/Account.json` as the minimal CLI-readable export

Why this package exists:

- keep built-in account recipes out of the generic provider core
- give the CLI a stable registry for first-party AA profiles
- leave room for later profiles such as multisig or WebAuthn-backed accounts

Current `sed-lite` notes:

- constructor shape is `Account(address owner)`
- recommended default deployment is `create2Account`
- default salt is `0x00...00` for deterministic first-pass prediction
- it is inspired by Clave's account architecture, but intentionally keeps the
  current repository's raw ECDSA smart-account signing flow
- it is a better AA base profile than `daily-spend-limit` for general account
  lifecycle work because owner rotation and module toggling are first-class
  self-calls instead of hardcoded policy branches
- it now includes a minimal validation-hook pipeline so policy contracts can be
  attached without re-baking the account core
- live Sepolia validation now covers deploy, native transfer, validation-time
  rejection for over-cap native transfers, and the first standalone
  `NativePerTxLimitHook` deployment / enablement path
- the same hook is now also validated on the approval-based paymaster path:
  below-cap transfers succeed and over-cap transfers fail during fee estimation
  with the hook-specific validation reason

Current `daily-spend-limit` notes:

- constructor shape is `Account(address owner)`
- recommended default deployment is `create2Account`
- default salt is `0x00...00` for deterministic first-pass prediction
- the policy module currently guards native-token spend, not generic ERC-20
  calldata parsing
- live Sepolia validation still shows that native transfer enforcement for this
  profile needs more EraVM-specific work; moving the policy into validation
  immediately hits the documented `SystemContext` restriction because the policy
  relies on `block.timestamp`
