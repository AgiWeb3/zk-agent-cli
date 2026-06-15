# @zk-agent/account-profiles

This package hosts built-in zkSync smart-account profiles that `zk-agent-cli`
can recognize without forcing the user to manually wire every account artifact.

Current scope:

- `daily-spend-limit`

Important boundary:

- the Solidity source is checked in here
- the zkSync EraVM artifact is not checked in yet
- until `artifacts/daily-spend-limit/Account.json` exists, the CLI will expose
  this profile as `source-only` and refuse deploy/predict with a clear error

Why this package exists:

- keep built-in account recipes out of the generic provider core
- give the CLI a stable registry for first-party AA profiles
- leave room for later profiles such as multisig or WebAuthn-backed accounts

Current `daily-spend-limit` notes:

- constructor shape is `Account(address owner)`
- recommended default deployment is `create2Account`
- default salt is `0x00...00` for deterministic first-pass prediction
- the policy module currently guards native-token spend, not generic ERC-20
  calldata parsing
