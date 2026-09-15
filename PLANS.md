# zk-agent-cli Plan

## Objective

Ship `zk-agent-cli` from the current `rc` line to `1.0.0` as a
zkSync-native, local-first CLI with:

- a clear first-run path
- an obvious post-flagship product surface
- an Agent Pay story that reads like a product layer, not only local tooling
- explicit benchmark closure against `polygon-agent-cli` on product packaging,
  not Polygon-specific vertical parity

## Current stage

- release stage: `rc`
- current package line: `0.1.0-rc.7`
- default AA path: `sed-lite`
- broad DeFi expansion: deferred
- current work: RC closeout, product-shell tightening, benchmark-gap closure,
  and Agent Pay platform shaping

## Landed baseline

- flagship path is validated:
  `setup -> next -> wallet create|reapprove -> next -> workflow pay`
- `start` exists as the public first-touch command; `next` remains the
  canonical operator/runtime contract
- `doctor`, `next`, `wallet`, `workflow`, and `suite` now share one
  question-first routing story
- hosted approval is documented and exercised as the current single-host
  operated baseline
- `suite` is now the default post-flagship packaged surface
- `suite` now exposes:
  - question-first entry layer
  - journeys
  - deeper-surface handoff
  - bounded proof paths
- Agent Pay is now a first-class packaged slice through `payment` and
  `suite`
- release validation and packaged install checks are in place

## Current priorities

1. Keep the first screen short and obvious:
   `start -> next -> wallet create/reapprove -> next -> workflow pay -> suite`.
2. Keep one canonical product story across README, package README, help,
   skills, JSON contracts, `PLANS.md`, and `PROJECT_STATE.md`.
3. Keep the hosted approval operated baseline explicit, supportable, and easy
   to explain as a fallback path rather than baseline complexity.
4. Keep the post-flagship product surface centered on `suite`, with Agent Pay,
   discovery, defaults, funding, and paymaster guidance easy to find.
5. Turn the `polygon-agent-cli` comparison into explicit release-critical
   decisions instead of vague parity language.
6. Keep Agent Pay moving toward a hosted platform layer without pretending the
   current local request store is already that platform.
7. Keep release validation, docs, dist-tags, and packaged behavior aligned so
   RC refreshes stay low-drift.

## Main remaining gaps

- onboarding is still stronger technically than it is market-facing
- hosted approval is correct but still longer to explain than it should be
- Agent Pay has strong local surfaces but not yet a hosted control-plane proof
- public differentiation versus `polygon-agent-cli` is still clearer in
  engineering terms than in first-screen product terms
- `1.0.0` still needs less manual judgment on final release readiness

## Release gates

### Ready for the next RC refresh

- `validate:release` passes
- `validate:rc` passes
- packaged install, flagship path, and hosted approval path stay green
- README, help, skills, JSON contracts, `PLANS.md`, and `PROJECT_STATE.md`
  stay aligned on the same product story
- no known blocker exists on `sed-lite`, `workflow pay`, local recovery, or
  hosted reapprove

### Ready for `1.0.0`

- every RC gate remains green across repeated rehearsals
- first-run onboarding is short enough for a new public user to understand
  without learning connector or relay internals first
- the post-flagship product surface centered on `suite` is clear enough to use
  without reading deep docs
- Agent Pay is visibly more than a local helper and has at least one easy
  platform-facing proof surface
- hosted approval and local-first recovery remain stable under repetition
- the public shell explains zkSync-native value clearly enough beside
  `polygon-agent-cli`
- no release-blocking issue remains on install, onboarding, approval,
  flagship pay, or release scripts

## Next execution cycle

### Milestone 1: tighten the product shell

- keep first-run docs/help short
- keep `doctor -> next -> suite` wording aligned
- keep the question-first `suite` entry layer visible everywhere

### Milestone 2: make Agent Pay easier to demo

- keep `payment` and `suite` routing obvious
- expose the shortest public proof paths directly
- make the hosted Agent Pay direction legible without over-claiming

### Milestone 3: reduce release drift

- keep docs, versioning, release notes, and dist-tags synchronized
- keep packaged validation authoritative
- keep state docs short and restart-oriented

## Explicit non-goals for `1.0.0`

- Polygon-specific chain breadth or browser-login semantics
- Polymarket parity
- public identity/reputation parity
- multi-host relay durability
- broad DeFi expansion beyond the current validated operator path
- broader AA profile expansion beyond the current `sed-lite` default path

## Working files

- `README.md`
- `packages/zk-agent-cli/README.md`
- `PLANS.md`
- `PROJECT_STATE.md`
- `docs/10-operator-json-contract.md`
- `docs/11-npm-release-gate.md`
- `docs/16-hosted-approval-operated-baseline.md`
- `docs/17-release-checklist.md`
- `docs/18-agent-pay-architecture.md`
- `packages/zk-agent-cli/src/commands/doctor.ts`
- `packages/zk-agent-cli/src/commands/next.ts`
- `packages/zk-agent-cli/src/commands/relay.ts`
- `packages/zk-agent-cli/src/commands/suite.ts`
- `packages/zk-agent-cli/src/commands/payment.ts`
- `packages/zk-agent-cli/src/lib/operator-suite.ts`
- `packages/zk-agent-cli/src/lib/suite-handoff.ts`
- `packages/agent-pay/src/service.ts`
- `packages/zk-agent-cli/scripts/release-check.mjs`
