# zk-agent-cli Plan

## Objective

Ship `zk-agent-cli` from `0.1.0-rc.1` to `1.0.0` as a zkSync-native,
local-first operator CLI.

Target: usability parity with `polygon-agent-cli`, not Polygon-specific feature
parity.

## Current stage

- release stage: `rc`
- core operator path: landed
- current work: RC closeout, state-doc compression, and release hardening
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
   skills, and runtime JSON.
2. Keep the hosted approval operated baseline documented, repeatable, and
   supportable as a single-host contract.
3. Keep `suite`, discovery, defaults, funding, and paymaster readiness
   coherent as one product slice.
4. Reduce release drift with stronger automation around version sync, docs,
   release notes, dist-tags, and packaged validation.
5. Keep state docs short and restart-oriented.

## Main remaining gaps

- the public shell is much tighter now, but the package manual can still be
  shortened further before `1.0.0`
- hosted approval is supportable and documented, but its market-facing story
  can still get shorter and clearer
- `suite` is now coherent as a catalog, but the overall post-flagship story
  can still be compressed into a simpler public narrative
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

### Ready for `1.0.0`

- the RC gate stays green across repeated rehearsals
- hosted approval and local-first recovery remain stable under repetition
- operator-suite packaging is clear enough for public users
- no release-blocking issue remains on install, onboarding, approval,
  flagship pay, or release scripts

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
