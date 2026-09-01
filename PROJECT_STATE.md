# zk-agent-cli Project State

## Snapshot

- updated: `2026-09-01`
- branch: `main`
- package stage: `0.1.0-rc.1`
- current focus: RC hardening and productization closeout

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
- wallet and workflow flows emit structured follow-up contracts
- discovery, defaults, funding, and paymaster readiness are exposed through
  `suite` and the CLI discovery surface
- release support exists through:
  `release:prepare`, `release:publish`, `validate:release`, and `validate:rc`

## Current priorities

1. Keep the public onboarding shell short and aligned across README, package
   README, help, skills, and runtime JSON.
2. Keep the hosted approval operated baseline explicit and repeatable.
3. Keep the post-flagship product surface centered on `suite`.
4. Keep release validation and dist-tag behavior repeatable with less manual
   judgment.

## Main remaining gaps

- public onboarding can still be lighter
- hosted approval still needs stronger product framing
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
- `scripts/release-prepare.mjs`
- `scripts/release-publish.mjs`
- `scripts/validate-rc.mjs`

## Default restart checks

- `pnpm validate:release`
- `pnpm validate:rc`

If the change is narrower, run the smallest relevant command or test instead of
defaulting to the full gate.
