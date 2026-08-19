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

1. Hosted relay is proven, but not yet productized to the same standard.
   - the current hosted path is real and validated, including public
     browser-mediated approval
   - the remaining gap is moving beyond the current file-backed prototype into
     a clearer operated-relay contract:
     deployment semantics, public-origin handling, durability expectations, and
     eventual auth/rate-limit policy

2. Release, versioning, and documentation discipline are still more manual than
   the reference.
   - the current public beta is already live on npm and both dist-tags point
     at it
   - but the release path still depends on manual version bumps, manual npm
     publish, manual dist-tag handling, and manual repo-doc sync
   - the remaining gap is one canonical public release contract that keeps the
     live npm version, install docs, CLI help, skills, and state docs aligned

3. Product-layer discovery and asset abstraction are still thinner than the
   reference.
   - the local Polygon reference splits discovery and operator verticals more
     aggressively
   - `zk-agent-cli` now has the stronger workflow/defaults model, but token,
     asset, and position discovery around the current validated paths still
     expect more local knowledge from the operator than they should
   - the remaining gap is richer symbol-first discovery and clearer validated
     token/default coverage around the canonical Sepolia paths
   - current baseline improvement:
     the packaged CLI, README/skills, and release gate now all point at the
     same discovery/defaults contract:
     `defaults`, `assets`, `tokens`, `resolve-token`, and the matching
     `workflow --help` token-recovery path
   - current baseline improvement:
     `assets`, `tokens`, and `resolve-token` now also expose compressed
     operator-facing `discoverySummary` payloads, while `smoke:discovery` and
     the operator JSON doc/release gate validate that contract directly
   - current baseline improvement:
     `balances --owned-tokens` and tokenized workflow follow-up/error surfaces
     now also expose compressed discovery summaries, so operators and harnesses
     no longer need to infer the recovery shape only from raw follow-up command
     strings
   - current baseline improvement:
     top-level `next`, `wallet next`, and workflow checkpoint restore now all
     expose the same compressed `tokenDiscoverySummary` contract for
     wallet-scoped or tokenized recovery paths, instead of forcing operators
     to reverse-parse discovery intent from raw command strings

4. Zero-setup onboarding and public install entrypoint are materially better,
   but still need maintenance discipline.
   - the current packaged install story, skill install story, root README,
     package README, CLI help, and repo skills are now substantially aligned
   - the remaining gap is keeping that public contract stable after each
     release, especially around first-run environment expectations:
     setup, connector locality, relay fallback, and when `.env` is actually
     required
   - current baseline improvement:
     `setup`, top-level `next`, root help, the packaged README, and the main
     skills now all surface the same first-run fork between local
     `--await-local` approval and relay-backed remote approval, and now say
     explicitly that a custom `.env` is usually not required until live reads
     or broadcasts
   - current baseline improvement:
     the top-level `doctor` command now compresses local config, wallet
     approval metadata, and signer readiness into one local-only diagnostic,
     and the public docs/release gate now lock that recovery contract
   - current baseline improvement:
     `relay serve` and `relay inspect` now also expose one shared
     `hostedReadinessSummary` plus an explicit
     `recommendedCommands.restartWithPublicOrigin` repair path, so hosted
     readiness no longer depends on operators reinterpreting multiple booleans
   - current baseline improvement:
     the release gate now also locks the hosted relay fallback, optional local
     `agent` profile path, nested wallet help surfaces, direct-command help
     surfaces, and the machine-readable `agent status --json` contract so
     those public entrypoints do not drift after publish
   - current baseline improvement:
     the repo now ships a native ChatGPT/Codex plugin manifest at
     `.codex-plugin/plugin.json` for the maintained `skills/` bundle, while
     `npx skills add ...` remains the direct compatible-harness repo-skill
     install path
   - current baseline improvement:
     a real external `skills` CLI parse smoke now works against the repo on a
     clean Node 24 path:
     `npx --yes skills add https://github.com/AgiWeb3/zk-agent-cli --list`
     recognizes the repository and lists the 4 expected skills
     (`zk-agent-cli`, `zk-aa`, `zk-defi`, `zk-relay`) without requiring an
     actual install first
   - current baseline improvement:
     a real project-scoped install smoke now also works on the same clean
     Node 24 path when the command stays explicit:
     `npx --yes skills add https://github.com/AgiWeb3/zk-agent-cli --skill '*' --agent codex --copy -y`
     installs the 4 expected skills into the temporary project's
     `./.agents/skills/` tree for Codex only
   - current baseline improvement:
     the repo now also includes `pnpm codex:plugin:doctor` and
     `pnpm codex:plugin:install-local` so a checked-out repo can be wired into
     the default personal Codex marketplace without manual JSON edits
   - current baseline improvement:
     on `2026-08-15`, after upgrading to `codex-cli 0.147.0`, a real native
     plugin install smoke also succeeded on this machine:
     `codex plugin marketplace list --json` recognized `personal`,
     `codex plugin add zk-agent-cli@personal --json` installed the plugin, and
     `codex plugin list --json` now reports
     `zk-agent-cli@personal` as installed and enabled from
     `~/plugins/zk-agent-cli`
   - current caution:
     `--all --agent codex` is not a safe equivalent for single-agent smoke,
     because the external `skills` CLI currently expands `--all` broadly and
     installs to every detected agent target
   - current caution:
     older Codex CLI builds may not expose the `codex plugin` top-level
     subcommand even when newer builds do; keep `/plugins` documented as the
     fallback install surface rather than assuming CLI parity everywhere
   - current baseline improvement:
     on `2026-08-15`, a fresh `codex exec --ephemeral` session outside the
     repository also picked up the installed native plugin and read both the
     top-level `zk-agent-cli` skill and the split `zk-aa` skill from the
     personal plugin cache

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

- the public npm package is live at `zk-agent-cli@0.1.0-beta.9`
- the install surface works as a packaged CLI, a repo skill surface, and a
  source-checkout wrapper
- the repo now ships both the compatible-harness skill surface and the native
  `.codex-plugin/plugin.json` manifest for the same maintained skill bundle
- native plugin onboarding now has repo-owned doctor/install helpers for the
  default personal marketplace path
- native plugin install validation now includes one real successful
  `codex plugin add zk-agent-cli@personal` smoke on this machine
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
     `/health`, `relay serve`, and `relay inspect` now also expose explicit
     `stateBackend`, `deploymentScope`, and `sameHostRestartPersists`
     semantics for the file-backed prototype, so operators can tell that the
     hosted path is single-host local-filesystem state instead of guessing
     restart or load-balancer behavior
   - current baseline improvement:
     relay-backed wallet create/reapprove outputs, workflow approval outputs,
     agent-tool workflow wrappers, and manual remote-approval smoke results
     now also expose explicit `shareLinkBaseUrl` and `statusApiBaseUrl`
     fields, so operators can read the final hosted link bases directly
     instead of inferring them from one sample request URL
   - current baseline improvement:
     `relay serve` and `relay inspect` now also expose the same compressed
     `deploymentSummary` contract for hosted deployment state, so operators
     and harnesses can consume the public-origin/readiness/single-host-state
     boundary without reverse-parsing the full raw payload
   - current baseline improvement:
     `relay serve` / `relay inspect` follow-up commands now prefer the
     one-shot remote-approval path with `--wait-relay --prompt-code`, and the
     agent-tool registry metadata now matches that hosted reapproval story
   - current baseline improvement:
     the relay/manual-approval recovery contract is now explicit across both
     `wallet request relay-status` and `wallet create|reapprove --wait-relay`:
     ready state points at `wallet request approve`, expired state points at
     `relay inspect` plus remote request reissue, and timeout errors now carry
     the concrete `relay-status` / `approve` follow-up commands with stable
     error codes and detail fields, instead of leaving the operator in a dead
     end or forcing JSON consumers to parse concatenated strings
   - current baseline improvement:
     `wallet request relay-publish`, `wallet request relay-status`, and the
     timeout/expiry relay-approval errors now also expose one shared
     `relayRecoverySummary` contract, so manual relay fallback tooling can
     consume the publish/poll/approve/reissue state machine without reverse-
     parsing raw relay fields and follow-up command maps separately
   - current baseline improvement:
     the higher-frequency direct remote publish surfaces now match that same
     summary contract too: `wallet create --relay-url` and
     `wallet reapprove --relay-url` now emit `relayRecoverySummary` instead of
     leaving operators and harnesses to infer recovery state only from raw
     relay fields plus `recommendedCommands`
   - current baseline improvement:
     root help, `next --help`, `wallet --help`, the root README, the packaged
     CLI README, and the primary repo skills now all describe the same
     local-first operator baseline, including the explicit `zk-agent next`
     follow-up after local reapproval/signer repair and the hosted relay path
     as the fallback instead of the default
   - expected observable result:
     a hosted operator no longer has to infer whether the relay is reporting
     the bind origin, the request origin, or the intended public origin
2. release/version/doc automation
   - keep the new public-entrypoint and canonical-path contract executable in
     `release:check`, not only described in docs
   - reduce manual release steps that can still drift after version bumps and
     publish
   - current baseline improvement:
     the repo now ships `pnpm release:sync-version`, which syncs the workspace
     version, published package version, plugin manifest version, and the
     current public-version references in the root state docs before publish
   - current baseline improvement:
     `release:check` now rejects drift across the package README, root README,
     `skills/`, packed top-level help, packed `wallet --help`, and packed
     `workflow --help`
   - current baseline improvement:
     the same gate now also rejects drift between the published package
     version and the current-version references kept in root state docs
   - expected observable result:
     version bumps and publish prep stop depending on manually re-reading the
     repo for stale public-version references
3. packaged operator UX and discovery polish from real usage
   - tighten the highest-frequency outputs only where real operators still
     hesitate: `next`, `wallet create|reapprove`, `relay serve`,
     `workflow pay`, and the asset/token discovery commands around them
   - keep changes narrow and evidence-driven; do not reopen broad command
     family redesign without repeated operator pain
   - current baseline improvement:
     the flagship `approval-based` path now surfaces fee-token discovery
     follow-ups directly in `next` and the `workflow pay` family:
     `tokens --role paymaster-fee-token` plus the matching role-scoped
     `resolve-token`, instead of leaving paymaster token recovery buried in
     generic token discovery or docs
   - current baseline improvement:
     `workflow auto`, `workflow status`, `workflow next`, and `workflow resume`
     now also expose one compressed `walletApprovalSummary` contract alongside
     the full `walletApproval` payload, so wrappers can distinguish
     `await-local`, `relay-pending`, and `approved` without re-parsing raw
     request, relay, and follow-up-command fields
   - current baseline improvement:
     `wallet status` and `wallet next` now also expose the same
     approval-based paymaster fee-token discovery follow-ups as top-level
     `next`, so wallet-layer remediation no longer drops the canonical
     `tokens --role paymaster-fee-token` and matching role-scoped
     `resolve-token` path
   - current baseline improvement:
     top-level `next --request-id` now also exposes one compressed workflow
     `summary` contract alongside the restored workflow `result`, so wrappers
     can read readiness, blockers, next action, and funding state without
     depending on the full workflow status payload shape
   - expected observable result:
     the shortest path becomes easier to follow without reading long docs or
     knowing local deployment metadata
4. public install/onboarding maintenance
   - keep the current public entrypoint story stable across README, package
     README, CLI help, and primary skills
   - treat future changes here as contract maintenance, not another large
     restructuring pass
   - expected observable result:
     a new operator can still choose the right install path and reach
     `zk-agent next` without repo context or guesswork after future releases
5. connector/approval hardening from live-usage findings
   - keep the hosted approval path stable under repeated relay polling,
     browser refresh, and manual operator retries
   - preserve observability in the end-to-end smoke path, especially for
     share-link instructions, approval-code prompts, and relay status waits
   - keep restricted-environment networking failures clearly distinguishable
     from relay or connector regressions
   - expected observable result:
     a real hosted manual-approval run no longer surprises the operator with
     hidden prompts, self-looping expired states, timeout dead ends, drifting
     approval codes, or false-negative DNS failures
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
