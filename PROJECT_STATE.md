# zk-agent-cli Project State

## Snapshot

- updated: `2026-09-03`
- branch: `main`
- package stage: `0.1.0-rc.2`
- current focus: RC hardening and productization closeout
- latest RC review artifact:
  `docs/release-stage-reviews/2026-09-01-main-rc.md`

## Landed baseline

- workspace and package layout are stable
- `sed-lite` is the default AA profile
- local-first wallet/session lifecycle exists:
  create, local approval, reapprove, export/restore, sync, and recovery
- flagship zkSync-native AA path exists and is validated:
  `setup -> next -> wallet create|reapprove -> next -> workflow pay`
- hosted relay approval exists with public operated evidence
- relay expiry recovery and local reissue semantics exist
- `setup`, `next`, and `doctor` emit structured onboarding summaries and
  follow-up paths
- `next` now also emits a product-entry summary that classifies the current
  operator question as bootstrap, recover, operate, or workflow
- wallet and workflow flows emit structured follow-up contracts
- discovery, defaults, funding, paymaster readiness, and hosted approval
  recovery are exposed through `suite` and the CLI discovery surface
- `suite --include-onboarding` can now expose the first-run preflight and the
  post-flagship operator surface together
- release support exists through:
  `release:prepare`, `release:checklist`, `release:publish`,
  `validate:release`, and `validate:rc`
- current repo-tracked RC review artifact reflects the live `rc -> 1.0.0`
  contract
- a short publish runbook now exists at `docs/17-release-checklist.md`
- public onboarding docs now separate the CLI manual, quickstart, repo skill
  path, and native Codex plugin path cleanly
- hosted approval wording now presents the current supportable claim explicitly
  as a single-host, same-origin, externally reachable operator path
- root README, package README, and docs index are now shorter and more clearly
  separated by role

## Current priorities

1. Keep the public onboarding shell short and aligned across README, package
   README, help, skills, and runtime JSON.
2. Keep the hosted approval operated baseline explicit and repeatable.
3. Keep the post-flagship product surface centered on `suite`.
4. Keep release validation and dist-tag behavior repeatable with less manual
   judgment.

## Main remaining gaps

- public onboarding is lighter now, though the package manual can still be
  tightened further before `1.0.0`
- hosted approval product framing is clearer, but can still get shorter and
  more market-facing
- post-flagship packaging still needs stronger cohesion
- release validation still needs more automation

## Deferred

- broad DeFi expansion and route-count parity
- multi-host or service-grade hosted relay architecture
- additional default AA profiles beyond `sed-lite`
- Polygon-specific vertical parity

## Restart points

Read first:

- `README.md`
- `packages/zk-agent-cli/README.md`
- `PLANS.md`
- `docs/10-operator-json-contract.md`
- `docs/11-npm-release-gate.md`
- `docs/17-release-checklist.md`
- `docs/release-stage-reviews/README.md`
- `docs/16-hosted-approval-operated-baseline.md`

Primary implementation entrypoints:

- `packages/zk-agent-cli/src/commands/setup.ts`
- `packages/zk-agent-cli/src/commands/next.ts`
- `packages/zk-agent-cli/src/commands/doctor.ts`
- `packages/zk-agent-cli/src/commands/relay.ts`
- `packages/zk-agent-cli/src/commands/suite.ts`
- `packages/zk-agent-cli/src/commands/wallet.ts`
- `packages/zk-agent-cli/src/commands/workflow.ts`
- `packages/zk-agent-cli/src/lib/onboarding-paths.ts`
- `packages/zk-agent-cli/src/lib/operator-suite.ts`
- `scripts/release-git-state.mjs`
- `scripts/release-checklist.mjs`
- `scripts/release-prepare.mjs`
- `scripts/release-publish.mjs`
- `scripts/review-rc.mjs`
- `scripts/validate-rc.mjs`

## Default restart checks

- `pnpm validate:release`
- `pnpm validate:rc`

If the change is narrower, run the smallest relevant command or test instead of
defaulting to the full gate.
