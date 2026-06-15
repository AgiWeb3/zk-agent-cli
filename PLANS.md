# zk-agent-cli Plan

## Objective

Build `zk-agent-cli` as a local-first, agent-oriented CLI for `zkSync Era` and the wider `ZK Stack`, preserving the reusable architecture of `polygon-agent-cli` while replacing Polygon/Sequence-specific implementation details with explicit zkSync provider boundaries.

## Current Status

### Baseline completed

- Workspace and package skeleton created.
- Shared session protocol package established.
- Local encrypted storage established.
- Wallet/session records can now distinguish execution address vs owner address for smart-account sessions.
- CLI and provider can now inspect whether a stored wallet is genuinely write-ready.
- CLI and provider now expose a generic smart-account `predict/deploy` path driven by supplied account artifacts.
- First built-in AA profile registry now exists in `packages/account-profiles`.
- `daily-spend-limit` is now registered as the first concrete smart-account profile.
- Verified default chain registry established for:
  - `zksync-era` (`324`)
  - `zksync-sepolia` (`300`)
- CLI entry migrated to `commander`.
- CLI supports:
  - `init|setup`
  - `wallet create/import/list/address/remove`
  - `balances`
  - `fund`
  - `send`
  - `send-token`
  - `call` (`read` + `write` preview/broadcast shape)
- Wallet provider read path moved to `zksync-ethers`.
- AA write preview path now returns zkSync-native transaction metadata without requiring a funded test wallet.
- Paymaster mode, address, and token metadata now flow through:
  - session approval payloads
  - wallet storage
  - CLI write commands
  - preview / JSON output
- Provider write path now builds live paymaster transaction parameters for:
  - `sponsored` via General flow
  - `approval-based` via zkSync testnet paymaster resolution and buffered allowance estimation
- Live Sepolia validation showed an important boundary:
  - a token that works for normal ERC-20 transfer preview may still fail approval-based paymaster validation
  - fee-token compatibility must be treated as a real chain/paymaster constraint, not inferred from ERC-20 compliance alone
- A self-deployed `18 decimals` ERC-20 now gives us a deterministic fee-token path on Sepolia:
  - approval-based preview / estimation succeeds with the testnet paymaster
  - real broadcast is still rejected during chain-side validation
- Direct `zksync-ethers` reproduction matches the same broadcast failure:
  - current blocker is not CLI request shaping alone
  - current blocker is the live broadcast validation path
- JSON errors can now return stable `code` and `details` when provider capability is missing.
- Write commands now fail early for undeployed smart-account records, missing local session keys, and signer/address mismatches.
- Smart-account deployment commands now fail with a stable structured error when the supplied artifact is standard EVM bytecode instead of zkSync EraVM bytecode.
- CLI smart-account commands can now resolve built-in profiles in addition to raw artifacts.
- Built-in profiles are currently surfaced with an explicit `artifact-ready` vs `source-only` status.
- Agent tool surface scaffolded in `packages/agent-tools`.
- Connector UI scaffold exists, but approval flow is not implemented yet.

### Not completed yet

- Real browser approval and relay-backed session confirmation.
- Smart account deployment and reconstruction flow.
  - current `smart-account` records can now be inspected for deployment readiness
  - generic artifact-driven deploy/predict exists
  - `daily-spend-limit` is now the chosen first concrete account profile
  - its compiled EraVM artifact is still missing from the repository
  - live deployment and post-deploy reconstruction still need to be validated
  - they still do not represent a completed deploy / reconstruct / restore lifecycle
- Funded end-to-end paymaster broadcast validation on zkSync test infrastructure.
  - approval-based preview is validated
  - approval-based broadcast is still blocked by chain-side validation on Sepolia
- Explicitly validated fee-token set or token-registry guidance for approval-based paymaster flows.
- End-to-end funded write broadcast test on zkSync test infrastructure.
- `swap`, `bridge`, `deposit`, `withdraw`.
- Identity / reputation plugin beyond placeholders.
- Broader `ZK Stack` chain registry and bridge routing.

## Architecture Rules

These are fixed unless a strong reason emerges:

1. `zksync-ethers` is the primary SDK for zkSync-specific wallet, bridge, AA, and paymaster behavior.
2. `commander` is the CLI framework.
3. CLI commands must stay thin:
   - parse input
   - render TTY output
   - render stable JSON output
4. All zkSync-specific logic lives behind provider interfaces from `agent-core`.
5. Core packages must not absorb vertical business logic.
6. Session, relay, and crypto concerns remain separate from CLI and provider implementation.
7. If zkSync has no direct equivalent for a Polygon-era feature, we mark it as:
   - not available yet
   - alternate implementation
   - deferred

## Environment Strategy

This project will not start by building against a full local `ZK Stack` ecosystem.

Current default environment:

- Primary target network: `zkSync Sepolia`
- Secondary optional path: lightweight local node for isolated fast tests
- Deferred path: full local `ZK Stack` ecosystem

Reasoning from local docs:

- Standard local testing can often use a normal local EVM node.
- zkSync-specific local environments become more important for:
  - bridging
  - cross-chain transactions
  - local L1 <-> L2 integration
  - Elastic Network / multi-chain behavior
- Full `zkstack` local deployment is heavier and more appropriate once we are implementing true chain-to-chain workflows.

Execution rule:

1. Develop wallet/session/AA/paymaster/core CLI behavior against `zkSync Sepolia`.
2. Introduce a lightweight local node only when it shortens iteration for isolated tests.
3. Stand up a full local `ZK Stack` environment only when Workstream 5 becomes active or when connector / transaction features require true local bridge behavior.

## What We Reuse From polygon-agent-cli

- Three-part system shape:
  - CLI package
  - browser connector UI
  - shared session / relay / crypto protocol
- Local encrypted storage model
- Dual-mode output strategy:
  - human-readable TTY
  - stable JSON for non-TTY / agent harnesses
- Session-first trust model:
  - explicit approval
  - constrained permissions
  - stored local restoration

## What We Do Not Inherit Blindly

- Sequence auth, access key, and session reconstruction
- Polygon-specific defaults
- Embedded vertical plugins in core CLI
- ERC-8004 identity assumptions
- Polygon-specific relayer / routing assumptions

## Package Map

| Concern | Package |
| --- | --- |
| CLI entry, commands, output | `packages/zk-agent-cli` |
| browser approval UI | `packages/zk-connector-ui` |
| session payloads, crypto, relay types | `packages/agent-session-protocol` |
| storage, registries, provider contracts | `packages/agent-core` |
| built-in smart-account profiles | `packages/account-profiles` |
| zkSync wallet / AA / balances / transactions | `packages/provider-zksync-wallet` |
| swap / bridge / deposit / withdraw | `packages/provider-zksync-defi` |
| agent-facing tool adapters | `packages/agent-tools` |
| identity / reputation experiments | `packages/plugin-identity` |

## Workstreams

### Workstream 1: Session And Wallet Foundation

Goal:
Make session state, wallet state, and account metadata strong enough to support real zkSync smart-account flows instead of only placeholder import/export.

Packages:

- `packages/agent-session-protocol`
- `packages/agent-core`
- `packages/provider-zksync-wallet`
- `packages/zk-agent-cli`

Tasks:

- Extend session payload to carry:
  - account kind
  - signer / validator metadata
  - chain scope
  - paymaster policy hints
  - session expiry and capability summary
- Split local persistence into clearer records for:
  - wallet identity
  - session authorization
  - pending approval request
- Define account capability helpers in provider layer.
- Make `wallet create` produce a more explicit smart-account-oriented request model.
- Keep `wallet import` compatible with structured session payloads.

Exit criteria:

- A stored wallet record can express more than just address + chain.
- Session payload schema is ready for browser approval integration.
- CLI output remains stable in TTY and JSON mode.

Validation:

- `pnpm typecheck`
- `pnpm zk-agent wallet create --help`
- representative `wallet create` / `wallet import` dry runs

### Workstream 2: Connector UI And Approval Flow

Goal:
Turn the connector scaffold into a real approval surface for CLI-originated session requests.

Packages:

- `packages/zk-connector-ui`
- `packages/agent-session-protocol`
- `packages/provider-zksync-wallet`

Tasks:

- Define request serialization format between CLI and connector.
- Implement request lookup / recovery flow.
- Show human-readable approval details:
  - requested chain
  - session expiry
  - transfer and call permissions
  - paymaster intent
- Implement confirmation code or equivalent session-binding step.
- Return importable session payload to CLI.

Exit criteria:

- `wallet create` can lead to a real browser approval path.
- Approved session can be imported back into the CLI.

Validation:

- connector UI local build
- manual end-to-end approval test
- `pnpm build`

### Workstream 3: AA Transaction Engine

Goal:
Introduce a real zkSync-native transaction execution layer instead of milestone placeholders.

Packages:

- `packages/agent-core`
- `packages/provider-zksync-wallet`
- `packages/zk-agent-cli`

Tasks:

- Add transaction builder interfaces for:
  - native transfer
  - ERC-20 transfer
  - contract call
- Represent zkSync-specific fields explicitly:
  - transaction type `113`
  - `customData`
  - `gasPerPubdata`
  - `factoryDeps`
  - `customSignature`
- Add a write-path executor abstraction:
  - prepare
  - estimate
  - send
  - wait
  - normalize result / error
- Implement CLI commands:
  - `send`
  - `send-token`
  - write-mode `call`

Exit criteria:

- At least one write transaction works end to end on zkSync test infrastructure.
- JSON output returns normalized transaction metadata.

Current note:

- base write flows without paymaster are the current safe path
- approval-based paymaster broadcast remains blocked by Sepolia validation even after fee-token compatibility was fixed

Validation:

- `pnpm typecheck`
- `pnpm zk-agent send --help`
- transaction smoke tests against a safe test wallet / testnet

### Workstream 4: Paymaster Capability

Goal:
Make paymaster use a first-class capability rather than an afterthought bolted onto commands.

Packages:

- `packages/provider-zksync-wallet`
- `packages/agent-core`
- `packages/zk-agent-cli`

Tasks:

- Define paymaster resolution interface.
- Support at least these modes structurally:
  - none
  - sponsored
  - approval-based
- Extend session payload and local policy state with paymaster permissions.
- Add estimation path that includes paymaster parameters.
- Normalize paymaster failures into machine-readable CLI errors.

Exit criteria:

- A command can explicitly choose a paymaster mode.
- CLI output can state whether paymaster was used and how.

Current note:

- `approval-based` is now preview-validated with the self-deployed `18 decimals` test token
- real broadcast still needs a revised account / validation strategy before this workstream can be marked end to end

Validation:

- `pnpm typecheck`
- targeted provider tests
- transaction dry runs where supported

### Workstream 5: Bridge, Deposit, Withdraw, And DeFi

Goal:
Build cross-domain asset movement without hardcoding Era-only assumptions into core.

Packages:

- `packages/provider-zksync-defi`
- `packages/provider-zksync-wallet`
- `packages/agent-core`
- `packages/zk-agent-cli`

Tasks:

- Add bridge-aware chain and token metadata.
- Implement default bridge discovery through provider.
- Add deposit and withdraw flows with multi-step status modeling.
- Add `fund` from info-only to actionable bridge guidance.
- Add `swap` only after execution, token metadata, and paymaster primitives are stable.
- Keep Elastic Network routing behind provider boundaries.

Exit criteria:

- `deposit` and `withdraw` have real provider implementations.
- Bridge metadata is no longer scattered in command code.
- Local `ZK Stack` environment is available if required for end-to-end bridge validation.

Validation:

- `pnpm typecheck`
- `pnpm zk-agent deposit --help`
- provider tests or scripted smoke paths

### Workstream 6: Agent Tooling And Plugin Surface

Goal:
Make the project useful not only as a CLI, but as an agent runtime component.

Packages:

- `packages/agent-tools`
- `packages/plugin-identity`
- `packages/zk-agent-cli`

Tasks:

- Provide stable tool wrappers for:
  - wallet creation
  - balance lookup
  - contract read
  - token transfer
  - paymaster-backed transaction submission
- Keep tool schemas structured and deterministic.
- Define plugin registration boundaries.
- Only implement identity / reputation after a concrete zkSync-compatible approach is validated.

Exit criteria:

- Agent frameworks can call tool wrappers without coupling to CLI internals.
- Identity stays optional and pluginized.

Validation:

- `pnpm typecheck`
- package-level tests
- example tool invocation scripts

### Workstream 7: Hardening, Docs, And Release Readiness

Goal:
Make the repository predictable to maintain and safe to hand to other developers.

Packages:

- entire workspace

Tasks:

- Add targeted tests where behavior stabilizes.
- Document env vars, command usage, and JSON output contracts.
- Tighten error messages and exit behavior.
- Add sample scripts for local smoke testing.
- Expand chain registry carefully for more `ZK Stack` networks.

Exit criteria:

- New contributors can run, inspect, and test the project from docs alone.
- Core commands have documented JSON contracts.

Validation:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- command help checks

## Immediate Coding Sequence

This is the next practical order of work:

1. Strengthen wallet/session schema and local records.
2. Turn `wallet create` into a real smart-account request flow.
3. Implement connector approval round-trip.
4. Build AA write-path executor.
5. Layer paymaster support into the executor.
6. Ship `send`, `send-token`, and write-mode `call`.
7. Move on to `deposit`, `withdraw`, `bridge`, and `swap`.
8. Expand agent tools and plugin surface.

## Near-Term Deliverable

The next milestone we should actively code toward is:

### Milestone A

- richer session payloads
- smart-account-oriented wallet records
- connector approval contract
- import/export flow that no longer feels placeholder-only
- thin CLI transaction surface for `send`, `send-token`, and write-mode `call`

Observable result:

- user can create a request in CLI
- approve it in browser
- import or restore a session locally
- use the session for read calls and prepare for write calls
- inspect zkSync-native transaction previews before paymaster and broadcast work lands

## Deferred Until Proven

- A zkSync-wide identity / reputation standard
- A single universal paymaster service abstraction for every chain
- A single swap / bridge implementation that fits all `ZK Stack` chains
- Any direct replacement for Polygon-specific identity commands

## Validation Policy

After each meaningful phase, run the smallest relevant checks first:

- `pnpm typecheck`
- command-level `--help`
- package-level tests where affected
- `pnpm build` when shared contracts, CLI entry, or UI behavior changes

Do not mark a phase complete until the relevant checks pass or the missing checks are explicitly documented.
