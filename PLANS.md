# zk-agent-cli Plan

## Objective

Ship `zk-agent-cli` from `rc` to `1.0.0` as a zkSync-native operator CLI and
local-first wallet/session product.

The target is usability parity with `polygon-agent-cli`, not Polygon-specific
feature parity.

## Current stage

- release stage: `0.1.0-rc.1`
- the core operator path is already closed
- remaining work is productization, release hardening, and public-surface
  polish
- `sed-lite` remains the default AA path
- broad DeFi expansion remains deferred unless explicitly resumed

## Stable baseline

- local-first wallet/session lifecycle exists:
  create, local approval, reapprove, export/restore, and recovery
- the flagship AA flow is validated on zkSync Sepolia:
  `setup -> next -> wallet create|reapprove -> next -> workflow pay`
- hosted relay approval exists with repeated public operated validation and
  deterministic local recovery handling
- `setup`, `next`, `doctor`, relay flows, and workflow entrypoints expose
  machine-readable follow-up contracts
- the operator-suite surface exists for discovery, defaults, funding, and
  paymaster readiness
- release gating exists through `release:*`, `validate:release`, and
  `validate:rc`

## Remaining gap vs `polygon-agent-cli`

- the public onboarding shell is still heavier than it should be
- hosted approval still needs to feel like a polished product flow, not just a
  relay feature
- post-flagship product slices need clearer packaging and naming
- release discipline is better, but still depends on some manual judgment

## Current priorities

1. Keep one canonical public onboarding path across root README, package
   README, help text, skills, and runtime JSON.
2. Finish the hosted approval operated baseline as a documented, repeatable,
   supportable single-host contract.
3. Keep `suite`, discovery, defaults, funding, and paymaster readiness
   coherent as one zkSync operator package.
4. Reduce release drift with stronger checks around version sync, release
   notes, docs, dist-tags, and packaged validation.
5. Keep internal state docs short and restart-oriented.

## Execution slices

### 1. Public shell and onboarding

- keep root `README.md` as an entrypoint, not the full operator manual
- keep `packages/zk-agent-cli/README.md` as the canonical user manual
- keep `setup`, `next`, `doctor`, and `wallet create|reapprove` aligned on one
  first-run story
- observable result:
  a new user can reach the default path in under a minute without reading
  project-memory docs

### 2. Hosted approval baseline

- keep support scope on the current single-host, file-backed operated model
- keep `docs/16-hosted-approval-operated-baseline.md` as the contract for URL,
  origin, persistence, expiry, restart, and manual recovery behavior
- keep `packages/zk-agent-cli/src/commands/relay.ts` and hosted relay smokes
  aligned with that contract
- observable result:
  repeated public reapprove rehearsals pass without extra oral guidance

### 3. Product packaging after flagship pay

- keep `packages/zk-agent-cli/src/commands/suite.ts` and
  `packages/zk-agent-cli/src/lib/operator-suite.ts` as the operator-suite
  front door
- make discovery, defaults, funding, and paymaster readiness read like one
  coherent zkSync-native product slice
- observable result:
  post-flagship capabilities are discoverable from CLI and package docs without
  browsing repo internals

### 4. Release hardening

- keep `scripts/release-prepare.mjs`, `scripts/release-publish.mjs`,
  `scripts/release-git-state.mjs`, `scripts/validate-rc.mjs`, and
  `docs/11-npm-release-gate.md` aligned
- prefer machine checks over checklist memory
- observable result:
  version sync, packaged install checks, release notes, and dist-tag behavior
  remain repeatable from one release gate

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
- no release-blocking issue remains on install, onboarding, approval, flagship
  pay, or release scripts

## Deferred areas

- broad DeFi breadth and route expansion
- multi-host or service-grade relay architecture
- additional AA profile expansion beyond `sed-lite` as the default
- feature-count parity with Polygon-specific verticals

## Working files

- `README.md`
- `packages/zk-agent-cli/README.md`
- `PROJECT_STATE.md`
- `docs/10-operator-json-contract.md`
- `docs/11-npm-release-gate.md`
- `docs/16-hosted-approval-operated-baseline.md`
- `packages/zk-agent-cli/src/commands/setup.ts`
- `packages/zk-agent-cli/src/commands/next.ts`
- `packages/zk-agent-cli/src/commands/doctor.ts`
- `packages/zk-agent-cli/src/commands/relay.ts`
- `packages/zk-agent-cli/src/commands/suite.ts`
- `scripts/release-prepare.mjs`
- `scripts/release-publish.mjs`
- `scripts/validate-rc.mjs`
