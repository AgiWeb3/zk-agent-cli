# zk-agent-cli Project State

## Snapshot

- updated: `2026-09-09`
- branch: `main`
- package stage: `0.1.0-rc.4`
- current focus: RC closeout, benchmark-gap assessment versus
  `polygon-agent-cli`, and Agent Pay platform planning
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
- a first local-first Agent Pay primitive now exists through
  `zk-agent payment`:
  create, list, show, set-status, and remove payment request records
- the Agent Pay request domain now lives in its own `packages/agent-pay`
  workspace package instead of being embedded inside `agent-core`
- wallet records now carry a stable `walletId`, and Agent Pay records can link
  to that identifier instead of relying only on mutable wallet names
- `packages/agent-pay` now includes a first application-service layer for
  payment create/show/list/set-status/remove flows, with the CLI staying as a
  surface and renderer
- `packages/agent-pay` now also owns the first explicit execution-plan
  contract for payment create/show/set-status outputs
- payment request records now also keep a first append-only `history[]`
  baseline, with legacy local records migrated on read
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
4. Turn the `polygon-agent-cli` comparison into explicit release-critical
   decisions instead of vague parity language.
5. Shape the next Agent Pay layer on top of wallet session, workflow, relay,
   and provider primitives.
6. Keep release validation and dist-tag behavior repeatable with less manual
   judgment.

## Main remaining gaps

- the public shell can still be shortened further before `1.0.0`
- hosted approval framing can still get shorter and more market-facing
- the post-flagship narrative can still be simpler for public users
- the product still lacks a first-class Agent Pay surface above the current
  wallet/workflow primitives
- local identity exists, but public zkSync-native identity/reputation does not
- release validation still needs less human judgment on the final promotion

## Benchmark view versus `polygon-agent-cli`

Current `zk-agent-cli` advantages:

- stronger zkSync-native AA posture with `sed-lite` as the default profile
- explicit session-scope and paymaster-aware approval semantics
- stronger local-first recovery and signer repair flows
- explicit hosted relay recovery with repeated public operated evidence
- cleaner internal separation across session protocol, wallet provider, DeFi
  provider, connector UI, and operator CLI

Current `polygon-agent-cli` advantages:

- broader market-facing story at first glance
- first-class payment language and `x402` entrypoint
- public onchain identity/reputation surface
- visible ecosystem verticals such as Polymarket
- managed-browser login assumptions that feel more turnkey for new users

Release interpretation:

- `zk-agent-cli` does not need Polymarket or Polygon-native identity parity to
  ship `1.0.0`
- it does need a comparably clear public product shell, a stronger payment
  narrative, and a more obvious default post-flagship path

## Agent Pay foundation status

Architecture source of truth:

- `docs/18-agent-pay-architecture.md`

Foundation already present:

- session approval request/payload/encryption protocol in
  `packages/agent-session-protocol`
- wallet/session lifecycle and local-first persistence in `agent-core`
- local-first payment request records and settlement-state tracking through
  `packages/agent-pay` and `zk-agent payment`
- zkSync wallet execution in `provider-zksync-wallet`
- zkSync DeFi routing and status tracking in `provider-zksync-defi`
- hosted relay and connector UI for remote approval
- workflow checkpoints and follow-up contracts for resumable execution

Still missing for the platform layer:

- payer/payee request model on top of wallet sessions
- payment intent, quote, and settlement surfaces
- service-facing payment entrypoint comparable to a platform API
- platform-grade reporting and history beyond local workflow state
- stable wallet identifiers for payment-domain linkage
- an Agent Pay application-service layer above storage helpers

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
- `docs/18-agent-pay-architecture.md`
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
