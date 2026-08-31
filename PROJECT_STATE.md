# zk-agent-cli Project State

## Snapshot

- updated: `2026-09-01`
- branch: `main`
- package stage: `0.1.0-rc.1`
- current focus: RC hardening and productization closeout

## Current release assessment

The project is already in the `rc` stage for the core zkSync-native path.

Why that is true:

- the default operator path is real and validated
- local-first wallet/session lifecycle is stable enough for normal use
- hosted relay approval has real public operated evidence
- release gates and version-sync scripts exist and are being tightened

Why this is not `1.0.0` yet:

- onboarding still needs a lighter public shell
- hosted approval still needs continued polish as a supportable product flow
- operator-suite packaging still needs to be easier to discover and explain
- release validation still needs to prove repetition with less manual judgment

## Stable product baseline

The following baseline should be treated as landed:

- workspace and package layout are stable
- `sed-lite` is the default AA profile
- local-first wallet/session lifecycle exists:
  create, local approval, reapprove, export/restore, sync, and recovery
- flagship zkSync-native AA flow exists and is validated:
  `setup -> next -> wallet create|reapprove -> next -> workflow pay`
- hosted relay approval exists with public browser/manual reapprove evidence
- relay recovery semantics exist for expired requests and local reissue
- `setup`, `next`, and `doctor` emit structured onboarding summaries and
  recommended paths
- workflow entry commands emit structured follow-up summaries
- discovery, defaults, funding, and paymaster readiness are exposed through the
  CLI and the operator-suite surface
- release support exists through:
  `release:prepare`, `release:publish`, `validate:release`, and `validate:rc`

## Current work in progress

1. Public shell simplification
   - keep root docs short
   - push operator detail into the package README and command help
   - keep one canonical first-run story

2. Hosted approval operated baseline
   - keep the supported deployment model explicit
   - preserve repeated public rehearsal coverage
   - keep restart, expiry, and reissue behavior easy to understand

3. Product packaging after flagship pay
   - make `suite`, discovery, defaults, funding, and paymaster readiness feel
     like one product slice
   - keep post-flagship value visible without reading internal docs

4. Release hardening
   - reduce doc/version/dist-tag drift
   - keep release scripts and release docs aligned
   - prefer machine-checked gates over manual memory

## Main remaining gap vs `polygon-agent-cli`

The main gap is now product-shell quality, not chain mechanics.

What still lags:

- faster onboarding from the public front door
- clearer hosted approval product framing
- stronger packaging of post-flagship capabilities
- more automated release discipline

What is already strong:

- local-first wallet control
- signer/session separation on the current path
- zkSync-native AA and paymaster depth around `sed-lite`
- workflow-first recovery and follow-up contracts

## Deferred areas

These areas are intentionally not the current focus:

- broad DeFi expansion and route-count parity
- multi-host or service-grade hosted relay architecture
- additional default AA profiles beyond `sed-lite`
- Polygon-specific vertical parity

## Restart points

When resuming work, start from these files:

- `README.md`
- `packages/zk-agent-cli/README.md`
- `PLANS.md`
- `docs/10-operator-json-contract.md`
- `docs/11-npm-release-gate.md`
- `docs/16-hosted-approval-operated-baseline.md`

Key implementation entrypoints:

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

## Practical checks

Use these as the default restart validation set:

- `pnpm validate:release`
- `pnpm validate:rc`

If the change is narrower, run the smallest relevant command or test instead of
defaulting to the full gate.
