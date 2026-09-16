# zk-agent-cli Project State

## Snapshot

- updated: `2026-09-15`
- branch: `main`
- package stage: `0.1.0-rc.7`
- current focus: RC closeout, benchmark-gap assessment versus
  `polygon-agent-cli`, and Agent Pay platform planning
- latest RC review artifact:
  `docs/release-stage-reviews/2026-09-11-main-rc.md`

## Current public baseline

- workspace layout is stable
- `sed-lite` is the default AA profile
- flagship path is validated:
  `setup -> next -> wallet create|reapprove -> next -> workflow pay`
- hosted approval exists as the current single-host operated baseline
- `start` is the public onboarding command; `next` remains the canonical
  runtime contract
- top-level help plus `setup` / `start` / `next` now share one shorter
  first-run shell centered on:
  `setup -> next -> wallet create|reapprove -> next -> workflow pay`
- `doctor`, `next`, `wallet`, `workflow`, and `suite` now share one
  question-first product-routing story
- `suite` is now the default post-flagship packaged surface
- `suite` now exposes:
  - a smallest question-first entry layer
  - journeys
  - deeper-surface handoff
  - bounded proof paths
- Agent Pay is a first-class slice through `payment` and `suite`
- `payment workspace` now exists as the public cross-request Agent Pay entry
  surface above `dashboard`, `queue`, `report`, and `feed`
- packaged validation now checks docs, JSON contracts, help text, install
  shape, and release-stage invariants

## Current priorities

1. Keep the hosted approval operated baseline explicit, repeatable, and short
   enough to explain as a remote-browser fallback.
2. Keep the post-flagship product surface centered on `suite`, with one
   obvious question-first default after wallet readiness.
3. Keep the benchmark work versus `polygon-agent-cli` explicit and tied to
   release-critical product gaps instead of broad parity language.
4. Keep Agent Pay moving from a strong local request layer toward a believable
   hosted platform direction.
5. Keep release validation and dist-tag behavior repeatable with minimal
   manual judgment.

## Main remaining gaps

- first-run onboarding is now shorter and more explicit, but the broader
  market-facing shell still needs stronger differentiation
- hosted approval framing is correct but still longer than it should be for a
  public first screen
- Agent Pay now has a stronger public local proof surface, but still lacks a
  hosted control-plane proof surface
- public differentiation versus `polygon-agent-cli` is still clearer in
  engineering terms than in first-screen product terms
- final `1.0.0` promotion still needs less human judgment

## Benchmark view versus `polygon-agent-cli`

Current judgment:

- `zk-agent-cli` is already strong on engineering quality and wallet/session
  depth
- it is **not yet** stronger than `polygon-agent-cli` on overall product
  competitiveness
- the remaining gap is mainly onboarding, public packaging, and hosted
  platform perception rather than raw operator capability

Current `zk-agent-cli` advantages:

- stronger zkSync-native AA posture with `sed-lite` as the default profile
- explicit session-scope and paymaster-aware approval semantics
- stronger local-first recovery and signer repair flows
- explicit hosted relay recovery with repeated public operated evidence
- cleaner internal separation across session protocol, wallet provider, DeFi
  provider, connector UI, Agent Pay, and CLI surfaces

Current `polygon-agent-cli` advantages:

- broader market-facing story at first glance
- lower-friction browser-login feel for new users
- first-class payment language and `x402` entrypoint
- public identity/reputation surface
- visible ecosystem verticals

Release interpretation:

- `zk-agent-cli` does not need Polygon-specific vertical parity for `1.0.0`
- it does need a comparably clear public shell, a stronger payment narrative,
  and a more obvious post-flagship path

## Agent Pay platform status

Architecture source of truth:

- `docs/18-agent-pay-architecture.md`

Foundation already present:

- local-first request records and service orchestration in `packages/agent-pay`
- payment ingress, workspace, queue, dashboard, report, approval, feed,
  handoff, quote, settlement, and reconcile surfaces
- wallet-aware follow-up routing through the existing session and workflow
  foundation
- relay-backed approval and workflow checkpoint primitives already available
  underneath the payment layer

Still missing for the platform layer:

- hosted control plane and multi-tenant persistence
- simpler public narrative for why Agent Pay matters
- one easy hosted proof surface that reads like product, not only local state

## Restart points

Read first:

- `README.md`
- `packages/zk-agent-cli/README.md`
- `PLANS.md`
- `docs/10-operator-json-contract.md`
- `docs/11-npm-release-gate.md`
- `docs/16-hosted-approval-operated-baseline.md`
- `docs/17-release-checklist.md`
- `docs/18-agent-pay-architecture.md`

Primary implementation entrypoints:

- `packages/zk-agent-cli/src/commands/doctor.ts`
- `packages/zk-agent-cli/src/commands/next.ts`
- `packages/zk-agent-cli/src/commands/relay.ts`
- `packages/zk-agent-cli/src/commands/suite.ts`
- `packages/zk-agent-cli/src/commands/payment.ts`
- `packages/zk-agent-cli/src/commands/wallet.ts`
- `packages/zk-agent-cli/src/commands/workflow.ts`
- `packages/zk-agent-cli/src/lib/operator-suite.ts`
- `packages/zk-agent-cli/src/lib/suite-handoff.ts`
- `packages/agent-pay/src/service.ts`
- `packages/zk-agent-cli/scripts/release-check.mjs`

## Default restart checks

- `pnpm validate:release`
- `pnpm validate:rc`

If the change is narrower, run the smallest relevant check instead of the full
gate.
