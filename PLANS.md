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
  - paymaster-success JSON follow-up contracts
  - swap-success JSON follow-up contracts
  - multi-step `smoke:product-path` orchestration and failure boundaries

## Reference delta vs `polygon-agent-cli`

### Already aligned or stronger

- monorepo shape is aligned
- local-first wallet/session lifecycle is substantially in place
- workflow orchestration is stronger and more explicit
- zkSync-native AA, paymaster, EraVM, and SED policy handling are deeper than
  the Polygon reference
- agent-facing tool wrappers exist as a real package, not just skill prose

### Main gaps that still matter

1. Public install and release discipline still lags the reference.
   - the local `polygon-agent-cli` reference is packaged as a public npm CLI
     with an explicit root install story:
     `npx skills add https://github.com/0xPolygon/polygon-agent-cli`
     and
     `npx @polygonlabs/agent-cli --help`
   - `zk-agent-cli` now has a live public beta package plus the repo-local
     workspace scripts and `skills/`
   - the remaining gap is post-publish discipline:
     clean-machine install smoke, clearer dist-tag/version policy, and keeping
     docs/help/package metadata aligned with the shipped surface

2. Product-layer discovery is still thinner than the reference.
   - the local Polygon reference splits discovery and vertical surfaces more
     aggressively:
     wallet, balances, send, fund, swap, deposit, withdraw, `agent`,
     `polymarket`, `x402-pay`, plus multiple installable skill slices
   - `zk-agent-cli` now has a stronger workflow layer and defaults surface, but
     token/asset/position discovery is still narrower and expects more local
     knowledge from the operator

3. Validated defaults breadth is still the main zkSync product gap.
   - `defaults` now exposes supported, validated, experimental, and fallback
     records for swap, bridge, paymaster, and token roles
   - the remaining gap is not structure but breadth:
     more tracked Sepolia router/paymaster/token combinations must be validated
     and promoted into the registry

4. User-facing asset abstraction is only partially caught up.
   - the local Polygon reference already treats symbol-first flows as normal
     product UX
   - `zk-agent-cli` now resolves tokenized command/workflow symbols through a
     shared token registry:
     local deployment metadata first, then optional
     `ZK_AGENT_TOKEN_DIRECTORY_ROOT`
   - the remaining gap is broader validated token coverage and richer
     asset-discovery UX, not the lack of symbol resolution itself

5. Connector maturity is now a polish gap, not a protocol gap.
   - local callback works
   - relay-capable remote approval exists end-to-end
   - the remaining work is more live validation, clearer operator guidance, and
     fewer rough edges around remote approval loops

6. Ecosystem integrations are still intentionally behind.
   - the local Polygon reference ships explicit product verticals such as
     `polymarket` and `x402-pay`
   - `zk-agent-cli` should not copy Polygon-specific products just to match
     feature count
   - the Phase 4E review now closes that question on the current baseline:
     no zkSync-native vertical workflow has enough repeated operator evidence
     yet to justify first-class packaging

7. Release/documentation discipline still needs tightening.
   - the root README and `skills/` are already materially better than earlier
     phases
   - the remaining gap is keeping the live npm package, CLI help, skills,
     packaging metadata, validation scripts, and install docs aligned as one
     shipped surface

### Non-goals in this comparison

- do not port Sequence auth or access-key bootstrap semantics directly
- do not chase Polygon-specific services just to match feature count
- do not expand SED into a broad AA framework before the CLI product flow is
  solid

## Phase 3 closeout

Phase 3 is complete on the current baseline.

Closed results:

- the default operator path is explicit and aligned across README, CLI help,
  and workflow guidance
- the repo ships an installable `skills/` surface instead of requiring full
  monorepo context
- connector approval supports relay-capable remote flows in addition to the
  local callback fallback
- workflow-first command and tool entrypoints cover the common operator actions
- validated defaults are machine-readable and surfaced through CLI, tools, and
  operator follow-up contracts

Phase 3 details were intentionally compressed here after closeout. If detailed
execution history is needed later, use git history instead of keeping large
completed phase blocks in the active plan.

## Phase 4 closeout

Phase 4 is complete on the current baseline.

Closed results:

- 4A: the public beta line is live through `zk-agent-cli@0.1.0-beta.6`,
  release checks exist, and the packaged CLI no longer depends on
  monorepo-only runtime coupling
- 4B: discovery/default/token inspection is now a first-class product surface
  instead of deployment-file tribal knowledge
- 4C: the current non-deferred breadth bar is met:
  one real canonical Sepolia ERC-20 deposit baseline exists and the missing L1
  allowance step no longer blocks deposit broadcast
- 4D: relay-backed remote approval is a shipped path with dedicated smoke
  coverage and stable top-level follow-up contracts
- 4E: no dedicated zkSync-native vertical is justified on current evidence;
  that is an explicit product decision, not unfinished work

Phase 4 details were intentionally compressed here after closeout. If later work
needs the old execution narrative, use git history instead of keeping large
stale planning blocks in the active plan.

## Phase 5: productization to parity

### Stage objective

Turn the current beta baseline into a product that can credibly stand beside
`polygon-agent-cli` on installability, remote operation, and zk-native operator
value.

### Exit criteria

This stage is complete when all of the following are true:

- the npm package is a primary install surface, not only a secondary wrapper
  around repo-local workflows
- agent-facing docs and skills default to the packaged install path whenever
  repository checkout is not actually required
- remote approval has a hosted-ready path on the shipped relay surface,
  including relay inspection, hosted share-link readiness, and at least one
  real public outside-in proof, even if more durable operated-relay work
  continues after this stage
- at least one zk-native flagship workflow is clearly productized around AA,
  paymaster, and workflow orchestration rather than just low-level command
  coverage
- release, package-completeness, and clean-machine install checks are part of
  the normal release discipline
- the skill surface is split by stable product slices, not only by one large
  repo-level guide

### Phase 5 closeout summary

Phase 5 is complete on the current baseline.

Closed result areas:

1. release discipline on the public package baseline
   - keep version, dist-tag, and clean-machine smoke policy explicit
   - keep README, skills, package metadata, and release scripts aligned with
     the actually published npm surface
   - reduce lingering Phase 4 naming and one-off publish knowledge
   - current baseline improvement:
     `packages/zk-agent-cli/scripts/release-check.mjs` now also enforces the
     minimum standalone package-README contract instead of leaving that gate
     fully manual
   - current baseline improvement:
     `release:check` now also performs a tarball install smoke in a temporary
     project outside the repository, so the clean-machine-like install path is
     no longer documented-only
   - current baseline improvement:
     the same installed tarball gate now also proves the hosted share-link
     entrypoint works end to end:
     a created relay request must redirect through `/r/<id>` into the bundled
     connector UI and still serve the hashed frontend asset from the relay
   - current baseline improvement:
     `packages/zk-agent-cli/scripts/assert-release-runtime.mjs` now turns the
     declared release floor into a hard gate:
     `release:check` fails immediately if the active release runtime is below
     Node 24 or if `pnpm` drifts away from the workspace-declared version
   - current baseline improvement:
     the package README contract is slightly tighter:
     `release:check` now also enforces the documented Node runtime floor and
     the real `~/.zk-agent/workflows/*.json` storage path instead of letting
     those packaged-install details drift
   - current baseline improvement:
     the full release gate has now passed once on the supported host runtime:
     `pnpm validate:release` completed on `2026-08-07` with Node `24.14.1`
     and `pnpm@10.30.3`, so release discipline is no longer only documented
     or partially exercised inside the restricted sandbox

2. hosted remote approval baseline
   - promote remote approval from a useful local prototype into a stable hosted
     operator path
   - keep the local relay for development, but stop treating it as the
     long-term product answer
   - current baseline improvement:
     the CLI can now inspect relay compatibility explicitly and the local
     prototype can advertise a hosted public origin when deployed behind a
     tunnel or reverse proxy
   - current baseline improvement:
     `relay inspect` and `relay serve` now also report whether the advertised
     public origin still looks local-only and whether hosted share-link
     approval is actually ready, instead of leaving that inference to the
     operator
   - current baseline improvement:
     the published CLI package now also bundles the connector UI build used by
     `relay serve`, so hosted share-link approval no longer requires a source
     checkout just to serve the approval UI
   - current baseline improvement:
     relay CLI coverage now asserts that a hosted request can actually enter
     the share-link route, land on the connector UI shell, and fetch the
     bundled frontend asset instead of only checking `/health`
   - current baseline improvement:
     a repo-local hosted deployment smoke now exists for real external relays:
     `pnpm smoke:hosted-relay -- --relay-url <url>` runs the real CLI
     `relay inspect`, publishes a synthetic request, and proves the hosted
     share-link/UI entrypoint against a caller-supplied relay URL
   - current execution note:
     real outside-in validation has now completed once on `2026-08-07`
     against a public frp-backed relay URL: `relay inspect` and
     `smoke:hosted-relay` both passed end to end, including `/health`,
     share-link redirect, and bundled connector UI asset delivery
   - post-Phase-5 follow-on on this line:
     the externally reachable proof now exists, but a more durable operated
     relay baseline can still continue after this stage beyond the current
     file-backed hosted prototype

3. zk-native flagship workflow
   - productize one end-to-end AA path as the product signature:
     wallet approval -> readiness -> paymaster-aware workflow execution ->
     recovery / resume
   - keep this narrower and more reliable than a broad DeFi feature chase
   - current baseline improvement:
     `pnpm smoke:flagship-workflow -- --wallet <name> [...]` now binds the
     relay-backed reapproval step and the paymaster-backed flagship native-send path
     into one narrower product smoke instead of leaving them as unrelated
     separate checks
   - current baseline improvement:
     the flagship AA native-send story is now also exposed as a first-class
     CLI entrypoint:
     `zk-agent workflow pay --wallet <name> --to <address> --amount <amount>`
     fixes the workflow to `send-native`, persists a checkpoint, executes when
     ready, reopens a missing writable session through the intent-scoped
     approval path, and defaults to approval-based paymaster mode unless the
     operator overrides it
   - current baseline improvement:
     the same flagship path now also exists in the machine-facing tool layer:
     `workflowPayTool` is part of `packages/agent-tools`, `tool:list` marks it
     as the primary guided-execution entry, and the operator/path smokes now
     point at `workflow pay` instead of the longer
     `workflow auto --intent send-native` surface
   - current baseline improvement:
     wallet-ready `next` guidance now defaults to `workflow pay` in both the
     CLI and top-level tool output, while preserving `workflowAuto` alongside
     it for broader multi-intent execution

4. product-slice skills
   - evolve from one main repo skill plus `zk-defi` into stable slices such as
     `zk-aa`, `zk-bridge`, or equivalent, but only when the slice is real and
     maintained
   - current baseline improvement:
     the skill surface now includes a focused `zk-aa` guide for the flagship
     relay-backed approval + paymaster-aware workflow path, instead of forcing
     AA guidance to stay buried in the repo-level skill only
   - current baseline improvement:
     the skill surface now also includes a focused `zk-relay` guide for hosted
     remote approval, relay readiness checks, share-link validation, and
     manual relay fallback instead of leaving those paths diffused across the
     repo-level skill and runbook prose

5. package-first install surface follow-through
   - keep removing the remaining repo-only runtime assumptions from the
     packaged CLI when they are found
   - keep agent-facing docs preferring `npx zk-agent-cli ...` /
     `npm install -g` unless source checkout is genuinely required
   - current baseline improvement:
     the root README, `skills/SKILL.md`, and `skills/QUICKSTART.md` now keep
     the packaged `zk-agent` entrypoint as the public default, only fall back
     to `pnpm zk-agent` when the operator is intentionally running from a
     source checkout, and the npm release gate now checks packaged help
     entrypoints instead of relying on the repo-local wrapper

### Completed post-Phase-5 architecture slice

The signer/session separation slice is complete on the current baseline.

Reference:

- [docs/14-best-session-model.md](./docs/14-best-session-model.md)

Closed results:

1. wallet storage now separates connector-approved session metadata from local
   execution authority through `localExecutionAuthority`
2. wallet inspection and workflow remediation now distinguish:
   - approval present
   - local write signer present
   - fully write-ready
3. relay/browser approval no longer silently implies that a local writable
   signer exists
4. the CLI now has an explicit local signer management path:
   - `wallet signer show`
   - `wallet signer attach`
   - `wallet signer remove`
5. the provider, DeFi withdraw/finalize write paths, lifecycle smokes, and
   follow-up guidance now resolve writable local execution through the split
   local authority model instead of depending only on the legacy payload field

Compatibility boundary kept intentionally:

- the legacy `sessionPayload.sessionPrivateKey` mirror still exists for
  compatibility and migration safety
- protocol v1 still carries that field as a legacy-compatible shape
- removing the legacy field entirely is not an active blocker for the current
  product stage

### Explicit non-goals

- do not chase Polygon-only verticals such as Polymarket or x402 just to match
  feature count
- do not resume broad swap/deposit protocol breadth as the default Phase 5
  track
- do not expand SED into a general AA framework before the packaged product
  path is solid

### First execution slice

The initial Phase 5 execution slice was the package-first install surface.

Result:

- the public npm package is live
- packaged users can run `help`, `defaults --json`, and
  `wallet smart-account profiles --json` without falling back to the source
  checkout
- built-in smart-account profile artifacts are bundled into the published
  package

### Immediate follow-on slice

The current execution slice is release discipline on top of that public package
baseline.

Reason:

- publish correctness now depends more on process drift than on missing
  packaging code
- the next avoidable failure mode is stale docs, stale script names, or wrong
  dist-tag handling rather than missing package assets
- this slice hardens the public install surface without reopening broad DeFi or
  AA scope

## Post-Phase-5 deferred backlog

These items stay deferred unless the product direction changes explicitly:

1. broader DeFi breadth
   revisit swap breadth only when the team wants to resume real DeFi
   expansion, not as default ongoing work
2. broader canonical ERC-20 breadth
   validate more mapped assets and at least one real L2 -> L1 ERC-20
   withdraw/finalize path when bridge breadth is resumed
3. hosted relay hardening beyond the shipped file-backed prototype
   resume only when the team wants a more durable operated relay baseline,
   stronger queue semantics, or production-facing auth/rate-limit policy
4. optional connector polish beyond the hosted path
   resume only if live operator usage shows concrete remote-approval friction

## Post-Phase-5 next execution slices

Unless priorities change, the next concrete slices should be:

1. hosted relay hardening on the shipped prototype
   - make relay deployment semantics less ambiguous under tunnels and reverse
     proxies, especially around reported `origin` vs `publicOrigin`
   - add one tighter operator/deployment contract for what must stay stable
     across `/health`, `relay inspect`, and share-link generation
   - current baseline improvement:
     `relay inspect` now exposes whether the inspected relay URL matches the
     relay bind `origin` and the advertised `publicOrigin`, and whether that
     `publicOrigin` is explicitly configured or only a bind-origin default,
     so proxy/tunnel deployments are less ambiguous in both JSON and TTY
     guidance
   - current baseline improvement:
     relay-backed wallet create/reapprove outputs and manual remote-approval
     smoke results now also expose explicit `shareLinkBaseUrl` and
     `statusApiBaseUrl` fields, so operators can read the final hosted link
     bases directly instead of inferring them from one sample request URL
   - expected observable result:
     a hosted operator no longer has to infer whether the relay is reporting
     the bind origin, the request origin, or the intended public origin
2. flagship AA real-user path on a public relay
   - validate one full operator story beyond the synthetic hosted smoke:
     `wallet create|reapprove --relay-url ... --wait-relay --prompt-code`
     followed by `workflow pay` on the same real public relay path
   - groundwork now exists in the shipped smoke layer:
     `pnpm smoke:remote-approval -- --wallet <name> --relay-url <url> --manual-approval`
     can publish a real browser/share-link request and either stop with
     machine-readable `shareUrl` / `statusUrl` / `recommendedCommands` or wait
     and finalize after a real 6-digit approval code is supplied
   - expected observable result:
     the current flagship story is proven not only by synthetic request
     smokes but also by one real browser-mediated approval flow
3. packaged operator UX polish from real usage
   - tighten the highest-frequency outputs only where real operators still
     hesitate: `next`, `wallet create|reapprove`, `relay serve`, and
     `workflow pay`
   - keep changes narrow and evidence-driven; do not reopen broad command
     family redesign without repeated operator pain
   - expected observable result:
     the shortest path becomes easier to follow without reading long docs
4. resume broader DeFi breadth only by explicit decision
   - keep swap/deposit/withdraw breadth out of the default mainline until the
     product direction reopens that work intentionally
   - if resumed, start with one concrete next bar such as a real L2 -> L1
     ERC-20 withdraw/finalize proof or broader canonical token coverage

## Deferred until after Phase 3

- broad identity / reputation framework
- Polygon-specific app parity such as Polymarket or x402
- passkey / multisig / broader AA module ecosystem
- broad ZK Stack chain expansion before the zkSync Era operator flow is solid

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
