# Core Difference Assessment

### 1. `zksync-ethers` SDK

Assessment: **important, but not the deepest protocol difference.**

Why:

- It determines which SDK is used for signer, provider, wallet, bridge, and
  related capabilities.
- But the local docs also show that zkSync is improving compatibility with
  standard Ethereum tooling through the EVM Interpreter. `zksync-ethers` is
  better treated as one implementation handle for zkSync-specific behavior, not
  as a principle that every layer must depend on directly.
- From an engineering perspective, it belongs in
  `provider-zksync-wallet`, not in the CLI, session protocol, storage schema,
  or plugin API.

Impact on `zk-agent-cli`:

- Read paths should stay as close as possible to standard EVM provider style.
- zkSync-specific write paths, bridges, paymasters, and AA transaction assembly
  should be handled in the provider adaptation layer.
- If a better SDK combination appears later, the CLI and protocol layers should
  not need a rewrite.

### 2. Account Abstraction (AA) transaction format

Assessment: **this is a core difference and must be abstracted first.**

Why:

- zkSync Era uses protocol-native AA, not an add-on abstraction layer.
- Transaction lifecycle, signing, fee fields, and paymaster parameters are all
  expressed directly in the transaction structure.
- `send`, `send-token`, `call`, `swap`, `bridge`, `deposit`, and `withdraw`
  all eventually depend on the same AA-aware construction and execution layer.

Impact on `zk-agent-cli`:

- The project needs a separate transaction builder/executor rather than hiding
  zkSync transaction details inside individual commands.
- Session reconstruction cannot stop at restoring a private key. It also needs
  account kind, signing path, policy context, and paymaster capability.
- Non-TTY JSON output must preserve zkSync-specific fields or agent harnesses
  will not be able to consume results reliably.

### 3. Paymaster

Assessment: **this is a core difference and a critical agent capability.**

Why:

- Paymasters determine whether the agent can use sponsored gas, token-based fee
  payment, or policy-constrained execution.
- They are not optional extensions. They are part of zkSync's native AA model.
- For an automated agent, paymaster availability, chosen mode, and downgrade
  behavior have a direct impact on task success rate.

Impact on `zk-agent-cli`:

- The project needs a dedicated paymaster capability model and error taxonomy.
- Normal sends and paymaster-backed sends should go through the same execution
  framework.
- Gas estimation, simulation, and error rendering must all understand
  paymaster branches.

## Other key areas that still matter

If these three points are the only focus, the later implementation loses too
much context. At minimum, the project also needs explicit treatment for the
following:

### Session keys and session policies

- The zkSync docs explicitly treat session keys and sessions as first-class
  features.
- That directly affects connector authorization, session protocol payloads, and
  which fields must be stored locally for recovery.

### The boundary between native AA and EIP-4337

- This is why the project should not copy a 4337 bundler/userOp mental model.
- Provider interfaces should be designed around zkSync native AA first, with
  room for future compatibility layers only where needed.

### Bridge, Asset Router, and Elastic Network

- The target is not a single-chain Era CLI. It is `zkSync + ZK Stack`.
- That makes bridges, cross-chain asset routing, default bridge discovery, and
  token mapping part of the infrastructure rather than optional plugins.

### Chain and asset registries

- In the Polygon reference, many chain, token, and funding details come bundled
  with vertical features.
- In the zk ecosystem those details need to live in dedicated registries, or
  Era, Sepolia, and future ZK Stack chains will become unmanageable.

### Gas, pubdata, and estimation

- zkSync transaction fields such as `gasPerPubdata` affect real execution.
- If the CLI does not surface them clearly enough, agent failures become harder
  to diagnose.

## Direct design requirements for the current project

1. `agent-core` should keep the chain registry, token registry, and provider
   interfaces.
2. `provider-zksync-wallet` should handle AA transaction assembly, signing,
   paymaster injection, and bridge address discovery.
3. `agent-session-protocol` should remain chain-agnostic, but its payloads need
   to carry zkSync account and policy information.
4. `provider-zksync-defi` should stay focused on vertical actions such as
   swap, bridge, deposit, and withdraw rather than defining the core
   transaction shape.
5. `plugin-identity` still must not invent a fake "official zkSync reputation
   standard". For now it should stay limited to local agent profiles and wallet
   linkage, with anything more clearly marked as alternative or deferred.
