# SDK and Tooling Assessment

## Start with the conclusion

`zksync-ethers` should be studied seriously, but it should not be elevated into
the central abstraction for the whole repository.

This is an engineering judgment, not a claim that the SDK is unimportant. The
actual point is:

- it fits naturally in the provider implementation layer
- it should not leak into the CLI command contract, session protocol, or
  storage schema

## Signals from the local source set

The local documentation keeps `zksync-ethers`-specific tooling references, but
it also makes clear that the EVM Interpreter improves compatibility with more
standard Ethereum tools. That means custom zkSync tooling should not be treated
as the only valid entry point forever.

That leads to two direct conclusions:

### Read paths should be standardized where possible

- balance reads
- chain-information reads
- ordinary read-only contract calls

These should stay close to a generic provider shape so the low-level
implementation can be swapped more easily later.

### Write paths should remain zkSync-specific

- native AA transactions
- paymaster support
- bridges
- factory deps
- custom signatures

Those features belong in the zkSync provider implementation and should not be
forced into a fake "every chain works the same way" abstraction.

## What this means for the current code structure

### `agent-core`

It should define only:

- provider interfaces
- registries
- storage
- shared types

It should not import a concrete zkSync SDK type as a core repository type.

### `provider-zksync-wallet`

This package can safely use:

- the zkSync provider
- zkSync wallets/signers
- bridge helpers
- zkSync-specific transaction serialization

### CLI

The CLI should only care about:

- user input
- TTY output
- JSON output
- error codes and structured results

It should not know whether the underlying implementation uses
`zksync-ethers` or some other SDK combination.

## Current recommended posture

The safest current approach is:

1. keep `zksync-ethers` as a primary reference implementation
2. define interfaces around capabilities rather than SDK types
3. keep read paths close to standard EVM behavior and specialize write paths in
   the zkSync provider

That way, if one part of the implementation needs to change later, the entire
repository does not have to move with it.
