# zkSync AA Transaction Format

## Why this is a primary implementation axis

In zkSync Era, account abstraction is not an external module. It is part of the
protocol itself. For `zk-agent-cli`, that means:

- a wallet is not just a wrapped EOA
- a transaction is not a normal EVM transaction with a few patches
- sessions, paymasters, bridges, and contract calls all have to converge on the
  same AA-aware execution path

## Most important transaction traits confirmed by the local docs

Based on the local transaction lifecycle material, zkSync transactions require
special handling for at least these areas:

- the EIP-712-style transaction type used by zkSync, documented as `0x71` /
  `113`
- zkSync-specific fields such as:
  - `gasPerPubdata`
  - `customSignature`
  - `paymasterParams`
  - `factoryDeps`
- the fact that `maxPriorityFeePerGas` does not play the same central role it
  typically does in a standard EIP-1559 mental model

Those fields make one point clear: the zkSync write path cannot be modeled as
"normal Ethereum transaction handling plus a provider URL".

## Implications for the CLI command layer

### `send`

- It needs to support native AA accounts.
- JSON output needs to retain transaction type, paymaster usage, chain context,
  and request identifiers.

### `send-token`

- It is not only an ERC-20 `transfer` wrapper.
- It also needs room for approval-based paymaster flows and token fee-payment
  behavior.

### `call`

- Read-only `eth_call` and state-changing `send transaction` must remain
  separate.
- The write-mode `call` path should go through the shared transaction executor
  rather than building and sending a raw transaction inside the command itself.

### `swap`, `bridge`, `deposit`, and `withdraw`

- These are all higher-level transactions constrained by the same zkSync
  transaction format.
- They should depend on one common builder/executor instead of each module
  managing gas, paymaster state, signing, and session context independently.

## Required provider boundaries

At minimum, the provider layer should separate three responsibilities:

### Transaction Builder

Responsible for:

- turning command input into a sendable zkSync transaction
- injecting zkSync-specific fields
- handling paymaster data, factory deps, and custom signatures

### Transaction Executor

Responsible for:

- gas estimation
- broadcasting transactions
- reading receipts
- normalizing execution errors

### Account Context Resolver

Responsible for:

- restoring session-backed accounts
- identifying account kind
- describing available capabilities such as paymaster, session, or module
  support

## What this means for the session protocol

`agent-session-protocol` is still a generic foundation. At minimum, future
payload evolution should account for:

- account kind
- chain scope
- session policy summary
- signer or validator identity
- paymaster usage constraints

This does not mean every field must be frozen today. It means the protocol has
to evolve without repeatedly breaking compatibility.

## Current implementation strategy

Current engineering judgment:

- `agent-core` defines the abstract transaction-execution interfaces
- `provider-zksync-wallet` translates those abstractions into zkSync AA
  transactions
- CLI commands only handle input/output and do not own raw zkSync transaction
  details

That is materially safer than hard-coding `zksync-ethers` calls directly inside
command implementations.
