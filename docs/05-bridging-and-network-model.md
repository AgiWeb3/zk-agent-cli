# Bridge and Network Model

## Why this must be modeled early

If `zk-agent-cli` only targeted a single Era chain, many shortcuts would still
be possible. But the project goal is explicitly `zkSync + ZK Stack`, which
makes bridge and network modeling infrastructure rather than a later add-on.

## What the local docs confirm

### Default L1/L2 bridges

- The zkSync docs describe a default bridge model.
- They also mention discovering default bridge addresses through
  `zks_getBridgeContracts` or equivalent SDK capabilities.
- That means bridge contract addresses should not be hard-coded inside commands.

### Token mapping

- The docs explicitly discuss L1/L2 asset bridging and token-address mapping.
- A token registry therefore cannot stop at symbol and decimals. It also needs
  cross-chain relationships.

### Withdraw delay

- The local source set notes the delay window for mainnet withdrawals.
- For the CLI, that means `withdraw` is not "broadcast and done". It is a
  multi-stage lifecycle.

### Elastic Network / ZKsync Connect

- The local material discusses cross-chain asset transfers under ZKsync
  Connect.
- That matters for the `ZK Stack` goal because it is no longer just an Era
  L1<->L2 bridge problem. It is a broader in-network asset-flow model.

## Design implications for `zk-agent-cli`

### Chain registry

At minimum it should describe:

- chain key
- chain id
- RPC URL
- explorer
- network family
- bridge support

More fields can be added as additional ZK Stack chains are integrated.

### Token registry

At minimum it should describe:

- token symbol
- chain-specific address
- whether the asset is native
- whether the asset is bridged
- bridge-related metadata

### Bridge provider

Bridge logic should not live directly inside CLI commands.

The safer direction is:

- let `provider-zksync-wallet` handle basic bridge address discovery and
  low-level transaction capability
- let `provider-zksync-defi` or a dedicated bridge module own the higher-level
  cross-chain flows

## Current implementation judgment

Current engineering stance:

- `fund` can begin as a light capability that tells the user how to fund the
  active account
- real `bridge`, `deposit`, and `withdraw` flows need chain registries, bridge
  discovery, and the shared transaction executor underneath
- `ZK Stack` support should not be implemented by promoting Era-specific
  behavior into a fake global default

## Current risk

The local source set proves that bridges and cross-chain behavior are core
topics, but it still does not justify freezing a full cross-chain abstraction
today.

So the most reasonable sequence is:

- define the registry/provider boundaries first
- support Era/Sepolia base chain information and funding entrypoints first
- add more chain-specific bridge behavior incrementally as concrete routes are
  implemented and verified
