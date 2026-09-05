# zk-agent-cli Project State

## Snapshot

- updated: `2026-09-05`
- branch: `main`
- package stage: `0.1.0-rc.3`
- current focus: RC closeout, release-gate hardening, and state-doc cleanup
- latest RC review artifact:
  `docs/release-stage-reviews/2026-09-03-main-rc.md`

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
- root help, README, package README, quickstart, and docs index now describe
  the `next` versus `suite` boundary with the same product-routing language
- the package README now also routes operators to the correct deeper surface
  (`doctor`, `wallet`, `workflow`, `suite`, `relay`) instead of keeping long
  direct-command inventories in the front door
- the native Codex plugin onboarding note is now shorter and framed as an
  install-path guide rather than a maintainer-machine narrative
- wallet and workflow help now use the same product-routing language as the
  top-level help and front-door docs, reducing drift between help surfaces
- relay and agent help now follow the same surface-routing contract as well,
  making the CLI help layer more consistent end to end
- `suite` now also groups its categories under explicit deeper surfaces
  (`workflow`, `discovery`, `relay`) so the packaged catalog reads more like a
  unified product surface and less like unrelated slices
- `suite` now also emits a top-level `surfaces[]` catalog so callers can jump
  directly to the correct deeper surface without inferring it from per-slice
  fields alone
- `suite` now also emits a top-level `journeys[]` layer so public operators
  can choose a product path by question, not only by slice or deeper-surface
  taxonomy
- `doctor`, `next`, `wallet status|next`, and workflow follow-up surfaces now
  expose aligned `suiteHandoffSummary` guidance and can point to a concrete
  suite journey when the operator is ready to leave the current surface
- packaged validation now checks `doctor --json` in both setup and wallet-ready
  states, including the stable `doctor -> suite` handoff

## Current priorities

1. Keep the public onboarding shell short and aligned across README, package
   README, help, skills, and runtime JSON.
2. Keep the hosted approval operated baseline explicit and repeatable.
3. Keep the post-flagship product surface centered on `suite`.
4. Keep release validation and dist-tag behavior repeatable with less manual
   judgment.

## Main remaining gaps

- the public shell can still be shortened further before `1.0.0`
- hosted approval framing can still get shorter and more market-facing
- the post-flagship narrative can still be simpler for public users
- release validation still needs less human judgment on the final promotion

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
