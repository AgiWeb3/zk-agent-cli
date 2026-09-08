# zk-agent-cli Plan

## Objective

Ship `zk-agent-cli` from `0.1.0-rc.1` to `1.0.0` as a zkSync-native,
local-first operator CLI, with explicit product benchmarking against
`polygon-agent-cli` before final release.

Target: usability parity with `polygon-agent-cli` on operator UX, payment
readiness, and packaged product surface, not Polygon-specific chain coverage or
vertical integrations.

## Current stage

- release stage: `rc`
- core operator path: landed
- current work: RC closeout, benchmark-gap closure versus `polygon-agent-cli`,
  and Agent Pay platform shaping
- current documentation push: keep README, package README, quickstart, help,
  skills, and runtime JSON on one canonical product story
- default AA path: `sed-lite`
- broad DeFi expansion: deferred

## Landed baseline

- local-first wallet/session lifecycle:
  create, local approval, reapprove, export/restore, sync, and recovery
- flagship AA path validated on zkSync Sepolia:
  `setup -> next -> wallet create|reapprove -> next -> workflow pay`
- `next` now exposes a more explicit product-entry contract across
  `bootstrap`, `recover`, `operate`, and `workflow`
- hosted relay approval exists with repeated public operated validation
- `setup`, `next`, `doctor`, relay flows, wallet flows, and workflow entry
  flows expose machine-readable follow-up contracts
- `suite` exists as the packaged post-flagship surface for discovery,
  defaults, funding, paymaster readiness, and hosted approval recovery, and
  can now optionally include the first-run onboarding/preflight map in the
  same readout
- a first local-first Agent Pay primitive now exists through
  `zk-agent payment`:
  create, list, show, set-status, and remove payment request records
- the Agent Pay request domain now has a dedicated workspace boundary under
  `packages/agent-pay` instead of living inside `agent-core`
- wallet records now have a stable `walletId`, and Agent Pay linkage is moving
  off mutable wallet names toward that identifier
- `packages/agent-pay` now also owns a first application-service layer for
  payment create/show/list/set-status/remove orchestration, reducing direct
  payment branching inside CLI command code
- `packages/agent-pay` now also owns the first stable payment execution-plan
  contract, so CLI JSON no longer invents plan fields ad hoc
- payment records now keep a first append-only `history[]` baseline so state
  changes are no longer only represented by the latest settlement snapshot
- `suite` now exposes both top-level `journeys[]` and `surfaces[]` so callers
  can choose by operator question or jump directly to the deeper owning
  surface
- `doctor`, `next`, `wallet status|next`, and workflow follow-up surfaces now
  expose stable `suiteHandoffSummary` guidance when the operator is ready to
  leave the current surface
- packaged validation now asserts `doctor --json` both in setup state and in
  a clean-room wallet-ready state, including the `doctor -> suite` handoff
- public onboarding docs now distinguish the CLI, repo skill, quickstart, and
  native Codex plugin entry surfaces explicitly
- root help now also explains the `next` versus `suite` surface boundary in
  product terms instead of only listing commands
- root README, package README, and docs index are now shorter and more clearly
  separated by role
- release support exists through:
  `release:*`, `release:checklist`, `validate:release`, and `validate:rc`
- a short publish runbook now exists at:
  `docs/17-release-checklist.md`
- a current repo-tracked RC review artifact exists at:
  `docs/release-stage-reviews/2026-09-03-main-rc.md`

## Current priorities

1. Keep one canonical onboarding story across README, package README, help,
   skills, and runtime JSON, with a tighter “start here” product shell.
2. Keep the hosted approval operated baseline documented, repeatable, and
   supportable as a single-host contract.
3. Keep `suite`, discovery, defaults, funding, and paymaster readiness
   coherent as one product slice with an obvious default journey.
4. Close the release-critical benchmark gaps versus `polygon-agent-cli` on
   public UX and payment narrative.
5. Define the Agent Pay platform direction on top of the existing wallet
   session, workflow, relay, and provider layers.
6. Reduce release drift with stronger automation around version sync, docs,
   release notes, dist-tags, and packaged validation.
7. Keep state docs short and restart-oriented.

## Main remaining gaps

- `polygon-agent-cli` still has a broader public story today: browser-login
  wallet UX, built-in payment language, onchain identity, and vertical surfaces
  such as `x402` and Polymarket
- `zk-agent-cli` is stronger on zkSync-native session control, local-first
  recovery, AA policy depth, and hosted relay approval, but that advantage is
  not yet compressed into a simpler market-facing story
- the current product shell still needs a more obvious “why this product” and
  “start here” path for first-time public users
- Agent Pay is not yet a first-class product surface: there is no payer/payee
  contract, quote/invoice/checkpoint surface, settlement history layer, or
  service-facing payment entrypoint built on top of the current wallet session
  and workflow primitives
- local agent identity exists, but zkSync-native public identity/reputation is
  still intentionally deferred
- release discipline is better, but repeated RC and final `1.0.0` promotion
  still require some manual judgment

## Release gates

### Ready for the next RC refresh

- `validate:release` passes
- `validate:rc` passes
- packaged install, local-first wallet path, and hosted approval path all pass
- README, help, skills, and runtime JSON stay aligned on the default path
- no known blocker exists on `sed-lite`, `workflow pay`, local recovery, or
  hosted reapprove
- the benchmark gap versus `polygon-agent-cli` is documented clearly enough to
  separate release-critical gaps from intentional non-goals

### Ready for `1.0.0`

- the RC gate stays green across repeated rehearsals
- hosted approval and local-first recovery remain stable under repetition
- operator-suite packaging is clear enough for public users
- the public product shell explains zkSync-native value clearly enough to stand
  beside `polygon-agent-cli` without borrowing Polygon-specific claims
- no release-blocking issue remains on install, onboarding, approval,
  flagship pay, or release scripts

## Benchmark assessment

### Where `zk-agent-cli` is already stronger

- zkSync-native account-abstraction depth around `sed-lite`, paymaster-aware
  writes, and policy-scoped session approval
- local-first storage, export/restore, signer attach, and wallet repair flows
- explicit hosted relay recovery with public operated validation
- workflow checkpointing and machine-readable handoff surfaces
- workspace separation across CLI, wallet provider, DeFi provider, account
  profiles, connector UI, and session protocol

### Where `polygon-agent-cli` is still ahead

- broader public packaging and easier market comprehension
- first-class payment narrative through stablecoin-fee and `x402` messaging
- public onchain identity and reputation surfaces
- prediction-market and other vertical integrations already visible in the CLI
- zero-config hosted login story with managed service assumptions

### Explicit non-goals for `1.0.0`

- Polygon-specific chain breadth or OMS-based browser login semantics
- Polymarket feature parity
- ERC-8004 or Polygon-native reputation parity
- multi-host relay durability

## Agent Pay platform direction

Build the next layer on top of the current session and workflow foundation, not
beside it.

Architecture source of truth:

- `docs/18-agent-pay-architecture.md`

Near-term platform primitives:

- payer authorization backed by the existing session-approval protocol
- wallet-scoped payment intents that reuse workflow checkpoints and follow-ups
- payee-facing request descriptors that can survive local-first and relay-backed
  approval paths
- settlement and status readouts that can be consumed by agent harnesses or a
  later hosted control plane

The current CLI should therefore evolve into the trusted operator runtime for
Agent Pay, while the later platform adds the service-facing payment entrypoints,
quoting, persistence, and reporting surfaces above it.

Guardrails from the architecture baseline:

- keep payment orchestration in `packages/agent-pay`, not in CLI command files
- keep `agent-core` generic and dependency-free from `agent-pay`
- replace wallet-name-based payment linkage with stable wallet identifiers
- split payment intent, execution, settlement, and history instead of
  extending one monolithic payment record

## Deferred

- broad DeFi breadth and route expansion
- multi-host or service-grade relay architecture
- additional AA profile expansion beyond `sed-lite`
- Polygon-specific vertical parity

## Working files

- `README.md`
- `packages/zk-agent-cli/README.md`
- `PROJECT_STATE.md`
- `docs/10-operator-json-contract.md`
- `docs/11-npm-release-gate.md`
- `docs/17-release-checklist.md`
- `docs/release-stage-reviews/README.md`
- `docs/16-hosted-approval-operated-baseline.md`
- `packages/zk-agent-cli/src/commands/setup.ts`
- `packages/zk-agent-cli/src/commands/next.ts`
- `packages/zk-agent-cli/src/commands/doctor.ts`
- `packages/zk-agent-cli/src/commands/relay.ts`
- `packages/zk-agent-cli/src/commands/suite.ts`
- `scripts/release-prepare.mjs`
- `scripts/release-checklist.mjs`
- `scripts/release-publish.mjs`
- `scripts/review-rc.mjs`
- `scripts/validate-rc.mjs`
