# zk-agent-cli Docs

This document set does not try to restate the official zkSync documentation.
Its purpose is to compress the background knowledge that `zk-agent-cli` actually
needs into actionable engineering judgments.

Current conclusions:

- Of the original three focus areas, `AA transaction format` and `paymaster`
  are the real protocol-level differences between zkSync and the
  Polygon/Sequence-oriented baseline.
- The `zksync-ethers` SDK matters, but it is an implementation vehicle rather
  than the deepest protocol abstraction. Project design should not treat it as
  the only source of truth.
- If `zk-agent-cli` is meant to serve `zkSync + ZK Stack` agents, it also needs
  explicit treatment for:
  - session keys and session policies
  - the boundary between native AA and EIP-4337
  - bridge, asset-router, and Elastic Network cross-chain models
  - zkSync-specific transaction fields, gas/pubdata semantics, and paymaster
    estimation differences
  - chain, token, and bridge registries

Recommended reading order:

1. [01-core-differences.md](./01-core-differences.md)
2. [02-aa-transactions.md](./02-aa-transactions.md)
3. [03-paymasters.md](./03-paymasters.md)
4. [04-sessions-and-accounts.md](./04-sessions-and-accounts.md)
5. [05-bridging-and-network-model.md](./05-bridging-and-network-model.md)
6. [06-sdk-and-tooling.md](./06-sdk-and-tooling.md)
7. [07-source-map.md](./07-source-map.md)
8. [08-daily-spend-limit-profile.md](./08-daily-spend-limit-profile.md)
9. [09-sed-lite-profile.md](./09-sed-lite-profile.md)
10. [10-operator-json-contract.md](./10-operator-json-contract.md)
11. [11-npm-release-gate.md](./11-npm-release-gate.md)
12. [12-hosted-relay-prototype.md](./12-hosted-relay-prototype.md)

Unless stated otherwise, these notes are derived from the local
`../zksync-docs` mirror so the repository can keep moving even when external
network access is unavailable.
