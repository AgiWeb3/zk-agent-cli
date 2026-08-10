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

1. Zero-setup onboarding and public install entrypoint still lag the reference.
   - the local `polygon-agent-cli` reference is explicit about the two public
     entrypoints that matter:
     `npx skills add https://github.com/0xPolygon/polygon-agent-cli`
     and
     `npx @polygonlabs/agent-cli --help`
   - `zk-agent-cli` now has a live npm package plus repo-local `skills/`, but
     the packaged install story, agent-skill install story, and first-run
     operator path are not yet presented as one equally obvious public surface
   - the remaining gap is reducing first-run operator knowledge around setup,
     connector expectations, relay fallback, and when `.env` is actually
     required

2. Hosted relay is proven, but not yet productized to the same standard.
   - the current hosted path is real and validated, including public
     browser-mediated approval
   - the remaining gap is moving beyond the current file-backed prototype into
     a clearer operated-relay contract:
     deployment semantics, public-origin handling, durability expectations, and
     eventual auth/rate-limit policy

3. Release, versioning, and documentation discipline are still more manual than
   the reference.
   - `zk-agent-cli@0.1.0-beta.7` is now live and both npm dist-tags `beta` and
     `latest` point there
   - but the release path still depends on manual version bumps, manual npm
     publish, manual dist-tag handling, and manual repo-doc sync
   - the remaining gap is one canonical public release contract that keeps the
     live npm version, install docs, CLI help, skills, and state docs aligned

4. Product-layer discovery and asset abstraction are still thinner than the
   reference.
   - the local Polygon reference splits discovery and operator verticals more
     aggressively
   - `zk-agent-cli` now has the stronger workflow/defaults model, but token,
     asset, and position discovery around the current validated paths still
     expect more local knowledge from the operator than they should
   - the remaining gap is richer symbol-first discovery and clearer validated
     token/default coverage around the canonical Sepolia paths

5. Ecosystem integrations are still intentionally behind.
   - the local Polygon reference ships explicit product verticals such as
     `polymarket` and `x402-pay`
   - `zk-agent-cli` should not copy Polygon-specific products just to match
     feature count
   - the current product decision remains unchanged:
     no zkSync-native vertical workflow has enough repeated operator evidence
     yet to justify first-class packaging

### Productization Closeout Target

This final productization closeout is done when all of the following are true:

- a new operator can discover one canonical public install path quickly,
  without needing repo context to choose between package, skill, and source
  surfaces
- the packaged install story, root README, package README, skills, and CLI help
  all describe the same first-run path and the same current npm version/tag
  reality
- the hosted relay path no longer feels like a raw prototype from the outside:
  its public contract, deployment expectations, and operator follow-up behavior
  are explicit and stable
- the current validated Sepolia workflow path has enough asset/token discovery
  polish that operators are not sent back to deployment metadata by default

### Non-goals in this comparison

- do not port Sequence auth or access-key bootstrap semantics directly
- do not chase Polygon-specific services just to match feature count
- do not expand SED into a broad AA framework before the CLI product flow is
  solid

## Closed Baseline

Completed work is intentionally compressed here. The important closed baseline
for the next stage is:

- the public npm package is live at `zk-agent-cli@0.1.0-beta.7`
- the install surface works as a packaged CLI, a repo skill surface, and a
  source-checkout wrapper
- hosted relay approval is proven end to end, including real public hosted
  proof
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
     relay-backed wallet create/reapprove outputs, workflow approval outputs,
     agent-tool workflow wrappers, and manual remote-approval smoke results
     now also expose explicit `shareLinkBaseUrl` and `statusApiBaseUrl`
     fields, so operators can read the final hosted link bases directly
     instead of inferring them from one sample request URL
   - current baseline improvement:
     `relay serve` / `relay inspect` follow-up commands now prefer the
     one-shot remote-approval path with `--wait-relay --prompt-code`, and the
     agent-tool registry metadata now matches that hosted reapproval story
   - current baseline improvement:
     root help, `next --help`, `wallet --help`, the root README, the packaged
     CLI README, and the primary repo skills now all describe the same
     local-first operator baseline, including the explicit `zk-agent next`
     follow-up after local reapproval/signer repair and the hosted relay path
     as the fallback instead of the default
   - expected observable result:
     a hosted operator no longer has to infer whether the relay is reporting
     the bind origin, the request origin, or the intended public origin
2. public install and onboarding unification
   - make one canonical public entrypoint obvious across the root README,
     packaged README, skills, and CLI help
   - treat `skills add`, `npx zk-agent-cli`, and the global `zk-agent`
     install path as one coherent public story instead of adjacent fragments
   - reduce first-run confusion around when `.env`, a local connector, or a
     hosted relay is actually required
   - expected observable result:
     a new operator can choose the right install path and reach `zk-agent next`
     without source-checkout context or guesswork
3. packaged operator UX and discovery polish from real usage
   - tighten the highest-frequency outputs only where real operators still
     hesitate: `next`, `wallet create|reapprove`, `relay serve`,
     `workflow pay`, and the asset/token discovery commands around them
   - keep changes narrow and evidence-driven; do not reopen broad command
     family redesign without repeated operator pain
   - expected observable result:
     the shortest path becomes easier to follow without reading long docs or
     knowing local deployment metadata
4. release/version/doc automation
   - make the live npm version, public dist-tags, install docs, state docs,
     and package metadata harder to let drift apart
   - keep the current Node/pnpm runtime gate, but reduce manual release steps
     where the reference repo already has stronger automation
   - expected observable result:
     a release no longer depends on remembering manual version, tag, and doc
     synchronization steps after publish
5. connector/approval hardening from live-usage findings
   - keep the hosted approval path stable under repeated relay polling,
     browser refresh, and manual operator retries
   - preserve observability in the end-to-end smoke path, especially for
     share-link instructions, approval-code prompts, and relay status waits
   - keep restricted-environment networking failures clearly distinguishable
     from relay or connector regressions
   - expected observable result:
     a real hosted manual-approval run no longer surprises the operator with
     hidden prompts, drifting approval codes, or false-negative DNS failures
6. resume broader DeFi breadth only by explicit decision
   - keep swap/deposit/withdraw breadth out of the default mainline until the
     product direction reopens that work intentionally
   - if resumed, start with one concrete next bar such as a real L2 -> L1
     ERC-20 withdraw/finalize proof or broader canonical token coverage

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
