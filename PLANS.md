# zk-agent-cli Plan

## Objective

Build `zk-agent-cli` as a zkSync / ZK Stack counterpart to
`polygon-agent-cli`, while keeping the reusable three-part system shape:

- CLI entrypoint
- browser connector UI
- shared session / relay / crypto protocol

The parity target is product usability parity for agents, not vendor parity
with Polygon-specific services.

Cross-environment handoff reference:

- [PROJECT_STATE.md](./PROJECT_STATE.md)

## Current baseline

The repo is already past scaffolding. The current stable baseline is:

- workspace and package boundaries are in place
- local wallet/session lifecycle exists:
  - create
  - await local approval
  - sync
  - export / restore
  - reapprove
- workflow orchestration exists:
  - `workflow plan`
  - `workflow start`
  - `workflow auto`
  - `workflow run`
  - `workflow status`
  - `workflow resume`
  - checkpoint list/show/update/delete
- core network actions exist in provider, CLI, and tool form:
  - `balances`
  - `fund`
  - `send`
  - `send-token`
  - `call`
  - `swap`
  - `bridge`
  - `deposit`
  - `withdraw`
  - `withdraw-status`
  - `withdraw-finalize`
- built-in AA profiles exist in `packages/account-profiles`:
  - `sed-lite`
  - `daily-spend-limit`
- `sed-lite` is the primary AA base profile:
  - future AA defaults, acceptance, and operator examples should stay on
    `sed-lite`
  - live Sepolia predict/deploy validated
  - live hook-managed policy rejection validated
  - approval-based smart-account live broadcast validated on the known-good
    EraVM fee-token path
- `daily-spend-limit` remains available only for narrower policy experiments
  and targeted regression coverage; it is not the default AA path
- paymaster test infrastructure exists in `packages/paymaster-test-assets`
- agent-facing tool wrappers exist in `packages/agent-tools`
- local-first agent identity/profile management now exists in
  `packages/plugin-identity`, CLI `agent`, and matching agent-tools wrappers
- the product-path smoke layer now has stable local test coverage for:
  - operator-path JSON follow-up contracts
  - onboarding and workflow entry-summary JSON contracts across
    `setup/next/doctor` and `workflow plan/start/pay/auto/run/status/next/resume`
  - paymaster-success JSON follow-up contracts
  - swap-success JSON follow-up contracts
  - multi-step `smoke:product-path` orchestration and failure boundaries

## Reference delta vs `polygon-agent-cli`

### Already aligned or stronger

- monorepo shape is aligned
- local-first wallet/session lifecycle is in place and already split cleanly
  between approval metadata and local execution authority
- workflow orchestration is stronger and more explicit:
  `next`, `workflow status|resume|next`, and `workflow pay` give a clearer
  operator path than the Polygon reference
- zkSync-native AA, paymaster, EraVM, and `sed-lite` policy handling are
  materially deeper than the Polygon reference
- relay/manual recovery and machine-readable follow-up contracts are already
  richer than the Polygon reference baseline

### Main gaps that still matter

1. Public front door is still heavier than the reference.
   - the Polygon root README is intentionally thin and points almost
     immediately to one canonical package manual
   - `zk-agent-cli` still asks a new operator to absorb more root-level prose,
     more state docs, and more install-path nuance than necessary
   - the remaining gap is one canonical public manual plus one short root
     handoff, with state/plan docs clearly treated as internal project memory

2. Zero-setup onboarding is not yet as tight as the reference.
   - the Polygon default story is close to:
     install -> `wallet login` -> fund -> operate
   - `zk-agent-cli` is already better than before, but still exposes more
     first-run choices earlier than ideal:
     `setup`, connector locality, relay fallback, and when custom `.env`
     values are actually required
   - the remaining gap is a default first-run path that works without repo
     context and without custom environment wiring unless the operator is
     deliberately switching to custom infrastructure

3. Hosted approval is validated, but not yet operated like a product.
   - the Polygon reference has a dedicated hosted login UI and hosted relay
     with an explicit deployment shape
   - `zk-agent-cli` now has repeated real public hosted operated rehearsal, but
     the baseline still assumes a single-host, file-backed relay and more
     operator awareness of `publicOrigin` than a polished product should
     require
   - the remaining gap is a clear operated-relay contract:
     deployment profile, durability expectations, public-origin behavior,
     repeated rehearsal evidence, and supportable hosting guidance

4. Release discipline is still more manual than the reference.
   - the Polygon reference uses a repo-level changeset/changelog workflow
   - `zk-agent-cli` already has `release:sync-version` and `release:check`,
     but version bumps, changelog output, npm publish sequencing, and
     post-publish doc hygiene still depend too much on manual execution
   - the remaining gap is one repeatable release contract that keeps npm
     version, dist-tags, README/help text, skills, and plugin metadata aligned

5. Product vertical packaging is thinner than the reference.
   - the Polygon reference exposes product slices such as `polygon-defi`,
     `polygon-discovery`, and `polygon-polymarket`
   - `zk-agent-cli` has already split the skill surface, but only the flagship
     native pay path is fully productized; the next zkSync-native vertical
     still is not obvious
   - the remaining gap is to package one real zkSync-native post-flagship
     surface instead of expanding generic DeFi breadth just to match feature
     count

### Next productization plan

1. Public shell simplification
   - keep the root README as a short front door
   - keep the package README as the canonical operator manual
   - keep `PLANS.md` and `PROJECT_STATE.md` concise and restart-oriented
   - acceptance:
     a new user can choose packaged CLI vs skill install vs source checkout in
     under a minute without reading state docs first

2. Zero-setup onboarding pass
   - tighten `setup`, `next`, `doctor`, and `wallet create|reapprove` messaging
   - keep "no custom `.env` required for first run" as the consistent public
     default
   - current baseline improvement:
     `skills/QUICKSTART.md` and the primary `skills/SKILL.md` now expose the
     same singular first-run path as the README/help contract:
     `setup -> next -> wallet create|reapprove -> next -> workflow pay`
     and that alignment is now enforced through `release:check`
   - acceptance:
     both the local approval path and the hosted approval path have one exact
     happy-path sequence in help/docs with no ambiguous prerequisite wording

3. Operated hosted approval baseline
   - define the supported deployment profile for public hosted approval
   - make `publicOrigin`, state backend, restart durability, and approval URLs
     explicit parts of the contract
   - add smoke coverage that matches the intended operated mode rather than
     only the current single-host prototype
   - current baseline improvement:
     runtime relay coverage and the packaged `release:check` installed-package
     smoke now exercise same-host restart persistence for the single-host,
     filesystem-backed hosted baseline
   - current gate improvement:
     `release:check` now also enforces the hosted URL contract and
     expired-request reissue contract from `docs/16`, and the installed relay
     smoke now proves the proxied/public-origin approval-endpoint summary on
     the packaged CLI path
   - current operator-rehearsal improvement:
     `pnpm smoke:hosted-operated-baseline -- --wallet <name> --relay-url <url>
     --reapprove --prompt-code` now provides one repeatable source-checkout
     command for the real external hosted relay path by composing
     `smoke:hosted-relay` and the browser/manual `smoke:remote-approval`
   - the same rehearsal now also supports
     `--repeat <count> --prompt-code`, so repeated operated-baseline evidence
     can be gathered with one structured command instead of manual command
     stitching
   - current evidence:
     one real public run completed on `2026-08-26` through
     `https://zk.frp.meroar.fun/` for `sed-lite-sa-v2`; one earlier request
     expired and was then reissued successfully; two additional consecutive
     public browser/manual reapprove runs then succeeded on `2026-08-27`
     through requests `10d5ce1e` and `f1ca1eb1`
   - latest report-backed evidence:
     one repeated public browser/manual reapprove series also completed on
     `2026-08-27` for wallet `main` through requests `a479c4a3` and
     `8122cdd5`, with the saved artifact at
     `~/.zk-agent/reports/hosted-operated-baseline/2026-08-27T14-10-33.792Z-main-reapprove.json`
   - the remaining gap is now recovery confidence and broader operated
     hardening rather than repeated rehearsal proof
   - current recovery improvement:
     `pnpm smoke:hosted-recovery -- --wallet <name>` now provides one
     deterministic local rehearsal for the expired hosted reapprove path, so
     inspect + reissue recovery semantics can be rechecked without waiting for
     an accidental public expiry
   - current evidence improvement:
     the same public rehearsal now supports `--save-report`, so repeated
     hosted RC evidence can be persisted under
     `~/.zk-agent/reports/hosted-operated-baseline/` instead of depending on
     terminal scrollback
   - acceptance:
     a standard hosted deployment no longer depends on FRP-style guesswork or
     hidden relay assumptions

4. Release automation and changelog discipline
   - keep `release:sync-version` and `release:check`, but reduce the remaining
     manual version/doc/tag steps
   - keep the release-stage docs and packaged onboarding contract under the
     same machine-checked release gate instead of relying on manual review
   - keep `CHANGELOG.md` plus `docs/releases/<version>.md` as the repo-owned
     public release artifact path
   - keep `release:draft-notes` as the lightweight git-range seed for
     versioned release notes, then reduce the remaining editor and publish-step
     friction around it
   - keep `release:publish` as the supported host wrapper for
     `validate -> whoami -> version-availability -> publish -> readback ->
     optional latest promotion`, including the neutral-cwd workaround for the
     workspace `devEngines` boundary
   - keep `pnpm validate:rc` as the explicit machine-checkable `beta -> rc`
     wrapper, while preserving the real public hosted rehearsal as a separate
     manual gate
   - let that same wrapper ingest the newest matching hosted operated-baseline
     evidence report, or one pinned `--report-file`, so repeated public proof
     does not have to be manually re-declared on every RC pass
   - keep `pnpm review:rc` as the explicit stage-review artifact generator so
     the last `beta -> rc` decision is written back into repo memory instead
     of disappearing with terminal history
   - current gate status:
     host-side `pnpm validate:release` and
     `pnpm validate:rc -- --wallet main --relay-url https://zk.frp.meroar.fun
     --json` both passed on `2026-08-27`, with `validate:rc` consuming the
     saved report for repeated public requests `a479c4a3` and `8122cdd5`
   - current review status:
     `pnpm review:rc -- --wallet main --relay-url https://zk.frp.meroar.fun
     --write` also passed on `2026-08-27`, producing
     `docs/release-stage-reviews/2026-08-27-main-rc.md` as the current
     repo-tracked beta-to-rc decision artifact
   - acceptance:
     one release checklist/command sequence produces a versioned package,
     synchronized docs, and a publish-ready changelog without hand-auditing the
     repo

5. Post-flagship vertical packaging
   - keep the post-flagship surfaces explicit instead of implied only by
     scattered README/help text
   - current packaged slices:
     discovery/defaults at `skills/zk-discovery/SKILL.md`
   - current packaged slices:
     paymaster readiness at `skills/zk-paymaster/SKILL.md`, anchored on
     `workflow pay`, `zk-agent defaults`, approval-based fee-token recovery,
     and the bounded `smoke:paymaster-success` validation path
   - current packaged slices:
     funding readiness at `skills/zk-funding/SKILL.md`, anchored on
     `workflow fund`, route-aware `FundingInfo`, workflow `fundingProgress`,
     and the bounded `smoke:funding-readiness` validation path
   - prefer spending the next productization effort on shell/onboarding,
     operated relay, and release-discipline closeout rather than reopening
     generic swap sprawl
   - acceptance:
     the chosen vertical has one skill, one README/help path, one smoke, and
     one machine-readable contract

### Non-goals in this comparison

- do not port Sequence auth or access-key bootstrap semantics directly
- do not chase Polygon-specific services just to match feature count
- do not expand SED into a broad AA framework before the CLI product flow is
  solid

### Productization closeout target

This closeout is done when all of the following are true:

- a new operator can discover the right install path quickly without repo
  context
- the packaged install story, root README, package README, CLI help, and
  skills all describe the same first-run path
- hosted approval has an explicit operated contract rather than prototype
  assumptions
- release cadence no longer depends on manual version/doc drift hunting
- at least one post-flagship vertical is packaged as a real product slice

### Release-stage gates

The project should move through release stages in this order:

`beta` -> `rc` -> `1.0.0`

Current judgment:

- remain on `beta`
- use `rc` only after the product contract is closed
- use `1.0.0` only after the `rc` contract survives repeated real release
  validation

#### Gate: `beta` -> `rc`

All of the following must be true:

1. Default operator path is singular and explicit.
   - local-first path:
     `setup -> next -> wallet create|reapprove -> next -> workflow pay`
   - hosted path:
     one exact supported sequence with no ambiguous prerequisite wording
   - root README, package README, CLI help, skills, and runtime JSON outputs
     all describe the same first-run contract

2. Hosted approval is operated, not just validated.
   - define the supported deployment profile
   - specify `publicOrigin`, share/status URL behavior, persistence backend,
     TTL/expiry, and restart semantics
   - keep smoke coverage on the intended operated mode, not only the current
     single-host prototype

3. Release flow is repeatable.
   - keep `release:sync-version` and `release:check`
   - reduce manual version/doc/tag drift
   - one release checklist/command path must produce the same result on a
     clean supported host without relying on operator memory

4. Public machine-readable contracts are frozen.
   - treat `onboardingSummary`, `workflowEntrySummary`,
     `walletApprovalSummary`, and the corresponding next-step command surfaces
     as compatibility boundaries
   - keep the freeze policy explicit in `docs/10-operator-json-contract.md`
     and machine-checked through `release:check`
   - further changes to those fields should be treated as intentional breaking
     changes rather than casual cleanup

5. Recovery semantics are stable on the default product path.
   - no known blocker around approval recovery, local signer recovery,
     relay-pending flow, or expired request handling
   - do not incorrectly claim write readiness when only approval metadata has
     been restored

#### Gate: `rc` -> `1.0.0`

All of the following must be true:

1. Every `rc` gate remains closed under repeated validation.

2. At least one additional zkSync-native product slice is packaged beyond
   flagship `workflow pay`.
   - preferred candidates:
     already exceeded by discovery/defaults, paymaster readiness, and funding

3. Two consecutive end-to-end release rehearsals complete without public
   contract churn on the default path.

4. No known release-blocking issue remains on:
   packaged install, local-first wallet bootstrap/recovery, hosted approval,
   or flagship `workflow pay`.

#### Not required for `1.0.0`

- broad DeFi breadth expansion
- Polygon feature-count parity
- broader app/ecosystem integrations
- broader AA profile expansion beyond the current `sed-lite` default path

## Closed Baseline

Completed work is intentionally compressed here. The important closed baseline
for the next stage is:

- the public npm package is live at `zk-agent-cli@0.1.0-beta.11`
- the install surface works as a packaged CLI, a repo skill surface, and a
  source-checkout wrapper
- the repo now ships both the compatible-harness skill surface and the native
  `.codex-plugin/plugin.json` manifest for the same maintained skill bundle
- native plugin onboarding now has repo-owned doctor/install helpers for the
  default personal marketplace path
- native plugin install validation now includes one real successful
  `codex plugin add zk-agent-cli@personal` smoke on this machine
- hosted relay approval is proven end to end, including real public hosted
  proof, but repeated stable public rehearsal is still open
- the flagship zkSync-native AA path is `workflow pay` on `sed-lite`
- the skill surface is already split into stable product slices
- signer/session separation is landed for the current local-first model

Older phase-by-phase execution detail now belongs in git history, not in the
active plan.

## Deferred product areas

These items stay deferred unless the product direction changes explicitly:

1. broader DeFi breadth
   revisit swap breadth only when the team wants to resume real DeFi
   expansion, not as default ongoing work
2. broader canonical ERC-20 breadth
   validate more mapped assets and at least one real L2 -> L1 ERC-20
   withdraw/finalize path when bridge breadth is resumed
3. ecosystem-specific verticals
   stay deferred unless real zkSync-native operator demand justifies a new
   first-class workflow family
4. broad identity / reputation framework
   keep it deferred until the local-first operator identity model is no longer
   sufficient
5. passkey / multisig / broader AA module ecosystem
   keep it deferred until the default single-operator product path is fully
   stable
6. broad ZK Stack chain expansion
   keep it deferred until the zkSync Era operator path is materially more
   mature

## Next execution slices

Unless priorities change, the next concrete slices should be:

1. public shell simplification
   - shorten the root README and make it a clean handoff to the packaged CLI
     manual
   - keep package README, CLI help, and skills aligned on one operator path
   - expected observable result:
     a first-time user can choose the correct entrypoint quickly without
     reading project-state docs
2. zero-setup onboarding pass
   - tighten the first-run story around `setup`, `next`, `doctor`, and wallet
     create/reapprove
   - keep the default contract explicit:
     no custom `.env` is normally needed for first use
   - expected observable result:
     local approval and hosted approval each have one unambiguous happy path
3. operated hosted approval baseline
   - move the relay contract beyond single-host prototype assumptions
   - define durable state expectations and public-origin behavior clearly
   - expected observable result:
     hosted deployment and approval troubleshooting no longer depend on tunnel-
     specific tribal knowledge
4. release automation and changelog
   - preserve `release:sync-version` and `release:check`
   - reduce the remaining manual publish, dist-tag, and changelog steps
   - expected observable result:
     version bumps and publish prep stop depending on manual drift hunting
5. post-flagship vertical packaging
   - choose one genuine zkSync-native slice after `workflow pay`
   - avoid reopening generic DeFi breadth as a proxy for product progress
   - expected observable result:
     the product gains one more clear use-case surface instead of only better
     infrastructure
6. broader DeFi breadth only by explicit decision
   - keep generic swap/deposit/withdraw expansion off the default roadmap
   - if resumed, do it as a deliberate product track with concrete validation
     goals

## Environment strategy

Current default environment:

- primary target network: `zkSync Sepolia`
- optional local fast path: lightweight local node
- deferred heavy path: full local `ZK Stack` ecosystem

Execution rule:

1. Validate wallet/session/AA/paymaster/core CLI behavior on `zkSync Sepolia`.
2. Use a lightweight local node only when it shortens isolated iteration.
3. Stand up full local `ZK Stack` infrastructure only when connector or bridge
   behavior genuinely requires it.

## Architecture rules

These remain fixed unless a strong reason emerges:

1. `zksync-ethers` is the primary SDK for zkSync wallet, AA, bridge, and
   paymaster behavior.
2. `commander` is the CLI framework.
3. CLI commands stay thin:
   - parse input
   - call providers / workflow helpers
   - render TTY or JSON output
4. All zkSync-specific logic lives behind provider interfaces from
   `agent-core`.
5. Session, relay, and crypto concerns remain separate from CLI and provider
   implementation.
6. If zkSync has no direct equivalent for a Polygon-era feature, classify it
   explicitly as:
   - not available yet
   - alternate implementation
   - deferred
