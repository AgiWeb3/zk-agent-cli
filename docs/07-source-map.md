# Local Source Index

The paths below are the local documentation references used directly for this
round of architecture and product judgments. They provide the shortest route
back to source material when implementation work resumes.

## Account abstraction and transactions

- `../zksync-docs/content/20.zksync-protocol/30.era-vm/20.transactions/10.transaction-lifecycle.md`
  - transaction lifecycle
  - zkSync-specific transaction fields
  - EIP-712-style transaction type

- `../zksync-docs/content/20.zksync-protocol/30.era-vm/70.differences/50.native-vs-eip4337.md`
  - the boundary between native AA and EIP-4337

- `../zksync-docs/content/00.zksync-network/68.zksync-era/02.unique-features.md`
  - native account abstraction
  - paymasters
  - session keys
  - the EVM Interpreter

## Paymaster

- `../zksync-docs/content/20.zksync-protocol/30.era-vm/80.account-abstraction/30.paymasters.md`
  - paymaster modes
  - estimation caveats

## Sessions and accounts

- `../zksync-docs/content/00.zksync-network/30.unique-features/30.zksync-sso/23.sessions.md`
  - sessions
  - temporary keys and policy model

- `../zksync-docs/content/00.zksync-network/30.unique-features/30.zksync-sso/27.accounts.md`
  - modular accounts
  - ERC-7579 direction

## Bridge and network model

- `../zksync-docs/content/20.zksync-protocol/00.rollup/40.bridging-assets.md`
  - L1/L2 asset bridging
  - default bridge discovery
  - asset mapping
  - withdraw delay

- `../zksync-docs/content/00.zksync-network/45.zksync-connect/20.crosschain-asset-transfers.md`
  - cross-chain asset flow in the Elastic Network
  - background on ZKsync Connect and the asset router

## Tooling

- `../zksync-docs/content/00.zksync-network/68.zksync-era/30.custom-tooling.md`
  - `zksync-ethers`
  - the current role of zkSync-specific custom tooling

## Confirmed baseline chain information

These values were checked during the earlier local-doc pass and can be treated
as the current minimum default set:

- zkSync Era Mainnet
  - chain id: `324`
  - RPC: `https://mainnet.era.zksync.io/`
  - explorer: `https://explorer.zksync.io`

- zkSync Sepolia
  - chain id: `300`
  - RPC: `https://sepolia.era.zksync.dev`
  - explorer: `https://sepolia.explorer.zksync.io`

If the underlying docs change later, re-check them from the local mirror rather
than extending this list from memory.
