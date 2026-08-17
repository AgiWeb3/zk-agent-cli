# zk-agent-cli Project State

## Snapshot

- Last updated: 2026-08-17
- Latest commit at write time: `82fc5bf`
- Current branch: `main`
- Working tree status when this document was written: dirty with hosted-relay
  readiness and workflow approval-summary productization follow-up edits

## Current status

The product baseline is already closed for the core zkSync-native path:

- `zk-agent-cli@0.1.0-beta.9` is live and both npm dist-tags `beta` and
  `latest` point there
- the public package, local-first wallet/session lifecycle, hosted relay path,
  and flagship `workflow pay` AA flow all exist and have real validation proof
- the current work is productization closeout and public-surface hardening, not
  missing chain mechanics
- broader DeFi breadth remains deferred unless explicitly resumed

### Current priorities

Current ordered priorities:

1. hosted remote approval hardening beyond the current file-backed prototype
2. release/version/doc alignment automation
3. operator-informed discovery and flagship UX polish
4. public install/onboarding maintenance
5. broader DeFi breadth only when it is explicitly resumed

Current concrete interpretation and constraints:

Architecture baseline to keep in mind:

- signer/session separation is now landed end to end for the current product
  path:
  - wallet storage separates approval metadata from local execution authority
  - `wallet status|next` and workflow remediation distinguish `reapprove` from
    `wallet signer attach`
  - relay/browser approval can restore approval metadata without claiming local
    write readiness
  - the CLI has explicit `wallet signer show|attach|remove` management commands
- the intended long-term end-state is still documented in
  `docs/14-best-session-model.md`, but the current baseline no longer treats
  signer/session separation as an open blocking architecture thread
- the legacy `sessionPayload.sessionPrivateKey` mirror remains intentionally
  for compatibility; removing it entirely is optional cleanup, not the active
  product priority

1. hosted relay hardening
   - reduce ambiguity around reported `origin` vs `publicOrigin` under
     reverse-proxy or tunnel deployments
   - tighten the deployment contract shared by `/health`, `relay inspect`,
     and share-link generation
   - current baseline improvement:
     `relay serve` / `relay inspect` / `/health` now expose the hosted-relay
     contract directly:
     `origin`, `publicOrigin`, `publicOriginSource`, `stateBackend`,
     `deploymentScope`, `sameHostRestartPersists`, `shareLinkBaseUrl`, and
     `statusApiBaseUrl`
   - current baseline improvement:
     relay-backed wallet create/reapprove outputs, workflow approval outputs,
     agent-tool workflow wrappers, and the manual `smoke:remote-approval`
     path now all point at the one-shot remote-approval path with
     `--wait-relay --prompt-code`
   - current baseline improvement:
     `relay serve` and `relay inspect` now also emit the same compressed
     `deploymentSummary` payload for hosted deployment state, so public-origin
     readiness and the current single-host filesystem-state contract stay
     machine-readable without re-parsing the full raw relay response
   - current baseline improvement:
     relay/manual approval no longer self-loops on stale hosted requests:
     `wallet request relay-status` now returns explicit `share_url` /
     `status_url` / `approval_url`, expired relay states now point at
     `relay inspect` plus remote request reissue, and the same timeout/expiry
     recovery guidance now also appears on `wallet create|reapprove --wait-relay`
     with stable `RELAY_APPROVAL_*` error codes and detail fields for JSON
     consumers
   - current baseline improvement:
     `wallet request relay-publish`, `wallet request relay-status`, and the
     timeout/expiry relay-approval errors now also emit one shared
     `relayRecoverySummary` payload, so manual relay fallback state stays
     machine-readable across publish, poll, approve, and remote reissue paths
   - current baseline improvement:
     direct `wallet create --relay-url` and `wallet reapprove --relay-url`
     publish outputs now also emit that same `relayRecoverySummary` contract,
     so the high-frequency remote-approval entrypoints no longer diverge from
     the lower-level manual relay fallback surface
   - current baseline improvement:
     root help, `next --help`, `wallet --help`, the root README, the packaged
     CLI README, and the primary repo skills now all describe the same
     local-first baseline, with hosted relay approval positioned explicitly as
     the fallback rather than the default
2. release/version/doc discipline
   - the product now has the public package, public beta line, hosted relay
     proof, and flagship AA proof; the remaining release risk is operational
     drift rather than missing package code
   - version bumps, npm publish, dist-tag alignment, and repo-doc refresh are
     still too manual compared with the reference repo
   - current baseline improvement:
     the repo now ships `pnpm release:sync-version`, which syncs the workspace
     version, published package version, plugin manifest version, and the
     current public-version references in the root state docs before publish
   - current baseline improvement:
     `release:check` now rejects drift across package/root README, `skills/`,
     current-version references in `README.md` / `PLANS.md` /
     `PROJECT_STATE.md` / `docs/11-npm-release-gate.md`, and the packed or
     installed top-level/public help surfaces
   - current baseline improvement:
     the same gate now also locks the discovery/defaults/workflow recovery
     contract across README, skills, operator JSON docs, and packed help:
     `defaults`, `assets`, `tokens`, `resolve-token`, and `workflow --help`
   - current baseline improvement:
     the same gate now also locks hosted relay, optional local identity, and
     lower-level recovery surfaces on the published CLI:
     `relay --help`, `agent --help`, `wallet request --help`,
     `wallet signer --help`, `wallet smart-account --help`, `bridge`,
     `send-token`, `swap`, `fund`, `deposit`, `withdraw`, and
     `agent status --json`
3. packaged flagship and discovery UX polish
   - the real-user proof is no longer pending on the current baseline:
     on `2026-08-10`, a real browser-mediated hosted reapproval completed for
     `sed-lite-sa-v2` on a public frp-backed relay request
     `53328a56`, and the same wallet then completed an approval-based flagship
     native-send broadcast with tx hash
     `0x7904ecaad5edfee1f84dbdc4f83aaf2d577b7875fab060e8e272d7aa2697e7e0`
   - the persisted workflow record for that execution is request
     `d5181c7e`, which now reports `lastRun.stage = goal-executed`,
     `lastRun.mode = broadcast`, and `status = ready`
   - narrow the top-level operator surfaces that matter most in real usage:
     `next`, `wallet create|reapprove`, `relay serve`, `workflow pay`, and the
     surrounding token/asset discovery path
   - current baseline improvement:
     `defaults`, `assets`, `tokens`, `resolve-token`, and `workflow --help`
     now all point at the same discovery and token-recovery path, so the
     operator can stay inside CLI help instead of falling back to repo prose
   - current baseline improvement:
     `assets`, `tokens`, and `resolve-token` now also expose compressed
     operator-facing `discoverySummary` payloads, and `smoke:discovery` plus
     the operator JSON doc/release gate now validate that discovery contract
   - current baseline improvement:
     `balances --owned-tokens` and tokenized workflow follow-up/error surfaces
     now also expose compressed discovery summaries, so the workflow recovery
     path stays machine-readable without reverse-parsing raw command strings
   - current baseline improvement:
     top-level `next`, `wallet next`, and workflow follow-up restore now also
     emit the same compressed `tokenDiscoverySummary` contract for
     wallet-scoped or tokenized recovery paths, so discovery routing stays
     machine-readable across the operator handoff surfaces that matter most
   - current baseline improvement:
     the `approval-based` flagship pay path now surfaces paymaster fee-token
     discovery commands directly in `next` and workflow follow-ups, so the
     operator gets `tokens --role paymaster-fee-token` and the matching
     role-scoped `resolve-token` without having to infer that recovery path
   - current baseline improvement:
     `workflow auto`, `workflow status`, `workflow next`, and `workflow resume`
     now also expose one compressed `walletApprovalSummary` contract alongside
     the full `walletApproval` payload, so automation can distinguish
     `await-local`, `relay-pending`, and `approved` without reverse-parsing
     request metadata, relay fields, and next-step command maps separately
   - the remaining gap is making those surfaces require less local knowledge
     about tokens, validated defaults, and which discovery command should come
     next
4. public install/onboarding maintenance
   - the public entrypoint story is now substantially aligned across the root
     README, package README, CLI help, and primary skills
   - current baseline improvement:
     `setup`, top-level `next`, root help, the packaged README, and the main
     skills now all show the same first-run fork between local
     `--await-local` approval and relay-backed remote approval, and now say
     explicitly that a custom `.env` is usually not required until live reads
     or broadcasts
   - current baseline improvement:
     the top-level `doctor` command now compresses local config, wallet
     approval metadata, and signer readiness into one local-only diagnostic,
     and the public docs/release gate now keep that recovery surface aligned
   - current baseline improvement:
     `relay serve` and `relay inspect` now also expose one shared
     `hostedReadinessSummary` plus an explicit
     `recommendedCommands.restartWithPublicOrigin` repair path, so hosted
     readiness no longer depends on operators reverse-parsing multiple booleans
   - current baseline improvement:
     `relay --help`, `agent --help`, and the package/root README now surface
     the hosted remote-approval fallback, direct-command escape hatches, and
     the optional local operator-identity path directly on the public surface
   - current baseline improvement:
     the repo now ships a native ChatGPT/Codex plugin manifest at
     `.codex-plugin/plugin.json` for the maintained `skills/` bundle, while
     `npx skills add ...` remains the direct compatible-harness repo-skill
     install path
   - current baseline improvement:
     on `2026-08-14`, the external `skills` CLI successfully parsed this repo
     from a clean Node 24 path with
     `npx --yes skills add https://github.com/AgiWeb3/zk-agent-cli --list`
     and recognized the 4 expected skills:
     `zk-agent-cli`, `zk-aa`, `zk-defi`, and `zk-relay`
   - current baseline improvement:
     on `2026-08-15`, a real project-scoped install smoke also succeeded from
     a clean Node 24 path with
     `npx --yes skills add https://github.com/AgiWeb3/zk-agent-cli --skill '*' --agent codex --copy -y`
     and installed the 4 expected skills into a temporary project's
     `./.agents/skills/` tree for Codex
   - current baseline improvement:
     the repo now also ships a local Codex plugin bootstrap helper:
     `pnpm codex:plugin:doctor` inspects the local plugin state, and
     `pnpm codex:plugin:install-local` wires this checkout into the default
     personal marketplace plus `~/plugins/zk-agent-cli`
   - current baseline improvement:
     on `2026-08-15`, after upgrading to `codex-cli 0.147.0`, a real native
     plugin install smoke also succeeded on this machine:
     `codex plugin marketplace list --json` recognized `personal`,
     `codex plugin add zk-agent-cli@personal --json` installed the plugin into
     `/Users/mac/.codex/plugins/cache/personal/zk-agent-cli/0.1.0-beta.9`,
     and `codex plugin list --json` now reports
     `zk-agent-cli@personal` as installed and enabled from
     `~/plugins/zk-agent-cli`
   - current caution:
     `--all --agent codex` is not a safe equivalent for single-agent smoke:
     the external `skills` CLI currently broadens that combination and
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
   - the remaining work here is contract maintenance after future releases,
     not missing native-plugin pickup proof on this machine
5. DeFi breadth only on explicit restart
   - do not let broader swap/deposit/withdraw breadth silently reclaim the
     default roadmap without a deliberate product decision

### Current validated product baseline

- hosted relay approval is proven end to end:
  - public hosted relay inspection and hosted share-link/UI validation passed
  - real browser-mediated hosted approval completed for `sed-lite-sa-v2`
    through request `53328a56`
- the flagship AA pay path is proven:
  - `workflow pay` is the canonical zkSync-native flagship path
  - approval-based broadcast succeeded on `sed-lite-sa-v2` with tx hash
    `0x7904ecaad5edfee1f84dbdc4f83aaf2d577b7875fab060e8e272d7aa2697e7e0`
  - workflow request `d5181c7e` resolved back to `ready`
- release discipline is real:
  - `release:check` covers packaged install, hosted relay entrypoint, runtime
    floor, and package README contract
  - `pnpm validate:release` has passed on the supported host runtime
- the managed sandbox can still produce false negatives for local relay listen
  or DNS, so real release/runtime checks should continue to be verified from
  the host shell when needed

## Project goal

Build `zk-agent-cli` as a zkSync / ZK Stack counterpart to
`polygon-agent-cli`, while keeping the reusable three-part system shape:

- CLI entrypoint
- browser connector UI
- shared session / relay / crypto protocol

This repository is not intended to be a rename-level fork of
`polygon-agent-cli`. The reusable skeleton is kept, while Polygon /
Sequence-specific implementation is replaced with zkSync-native provider
boundaries.

## What exists right now

### Workspace and package layout

Active packages:

- `packages/zk-agent-cli`
- `packages/zk-connector-ui`
- `packages/agent-session-protocol`
- `packages/agent-core`
- `packages/provider-zksync-wallet`
- `packages/provider-zksync-defi`
- `packages/agent-tools`
- `packages/plugin-identity`
- `packages/paymaster-test-assets`
- `packages/account-profiles`

### CLI and workflow surface

Implemented command areas include:

- `setup`
- `wallet create/import/list/address/remove`
- `wallet status`
- `wallet next`
- `wallet sync`
- `wallet export`
- `wallet restore`
- `wallet reapprove`
- `wallet paymaster set`
- `wallet request show/list/await-local/approve-local`
- `wallet smart-account profiles/predict/deploy`
- `wallet smart-account sed-lite ...`
- `wallet smart-account daily-spend-limit ...`
- `balances`
- `fund`
- `send`
- `send-token`
- `call`
- `swap`
- `bridge`
- `bridge-status`
- `deposit`
- `deposit-status`
- `withdraw`
- `withdraw-status`
- `withdraw-finalize`
- `workflow plan/start/run/status/resume/list/show/update/delete`
- `agent status/show/set/export/import/clear`
- top-level / wallet / workflow / wallet-request / smart-account help surfaces
  are now explicitly product-ordered around the canonical `next -> wallet ->
  workflow` path instead of the internal implementation order

### Agent-facing tool surface

`packages/agent-tools` now exposes real wrappers for:

- wallet lifecycle and approval orchestration
- wallet status and next-step guidance
- workflow planning, execution, checkpointing, and resume
- the flagship native-send tool preset through `workflowPayTool`
- balances
- contract reads and writes
- send / send-token
- swap preview
- bridge preview/status
- deposit preview/status
- withdraw preview/status/finalize preview
- smart-account plan/deploy wrappers
- local agent profile read/write wrappers
- `pnpm tool:list` / `pnpm tool:run -- --list` as the machine-readable tool
  registry surface, including:
  - grouped tool discovery
  - closest CLI equivalents
  - `operatorPathStage` for the canonical product path
  - `recommendedSequence` for the default stage order, now with
    `workflowPayTool` as the primary guided-execution entry
  - `exampleInput` on the key operator-path tools, now covering the main
    wallet/workflow inspection and checkpoint entry surfaces such as
    `wallet status|next`, `workflow plan|pay|status|next|run|start`, and
    `assets`
- smoke scripts for:
  - canonical operator-path preview validation
  - readonly provider access
  - lifecycle recovery
  - SED policy validation
  - paymaster-backed smart-account success path
  - validated default swap success path
  - product-path orchestration aggregation
  - withdraw follow-up through finalize preview/broadcast boundaries

### Session and wallet model

The local wallet/session model already supports:

- execution address vs owner address split
- stored session metadata and local write readiness
- approved local session import
- export / restore
- restore-time reapproval
- CLI and agent-tools session guardrail presets, including:
  - `full-access`
  - `transfer-only`
  - `contract-only`
  - `readonly`
  - workflow/tool-side `intent` derivation for guided session recovery
- deployed smart-account metadata refresh through `wallet sync`

### Local agent identity model

`packages/plugin-identity` is no longer placeholder-only.

The current shipped shape is intentionally local-first:

- one saved agent profile in `~/.zk-agent/agent/profile.json`
- stable local metadata fields such as name, description, uri, tags,
  capabilities, and free-form key/value metadata
- optional linkage to one stored wallet record for operator/harness context
- portable export/import bundle for cross-machine or harness handoff
- CLI surface through `zk-agent agent status|show|set|export|import|clear`
- agent-tools surface through `getAgentProfileTool`, `setAgentProfileTool`,
  `exportAgentProfileTool`, and `importAgentProfileTool`

What is still intentionally missing:

- no claim that this is a zkSync-native onchain identity standard
- no built-in reputation scoring model
- no external publish/register flow yet

### AA and account model

Current built-in AA profiles:

- `sed-lite`
- `daily-spend-limit`

Current posture:

- `sed-lite` is the main built-in AA base profile
- future AA defaults, acceptance, and operator examples should stay on
  `sed-lite`
- `daily-spend-limit` remains a narrower experiment
- `daily-spend-limit` is now kept for constrained policy coverage and targeted
  regression/control-wallet validation, not as the repository baseline

What is already validated:

- EraVM artifact compilation for both profiles
- live Sepolia `predict` and `deploy` for `sed-lite`
- live Sepolia `predict` and `deploy` for `daily-spend-limit`
- `sed-lite` self-call account management
- `sed-lite` validation-hook pipeline
- `NativePerTxLimitHook` live policy rejection on Sepolia
- approval-based paymaster execution under the validated `sed-lite` path

Relevant deployed addresses already validated in this repo:

- `sed-lite-sa-v1`
  `0x26920E7b9c7478C1227f27613BaDe04eF2ddE7bC`
- `sed-lite-sa-v2`
  `0x60E5E483DC4315f3db1185aF08499ce9a4C862CE`
- `daily-spend-limit-sa`
  `0x271bEEaE75462eabdE3632A624B17FF163504CA2`
- `NativePerTxLimitHook`
  `0xC709133f19aEaa635492c000795f8f274d13aE22`

### Paymaster status

Paymaster is no longer a placeholder. The validated state is:

- `none`
- `sponsored`
- `approval-based`

What has been validated:

- sponsored preview works with the self-deployed EraVM paymaster
- sponsored live broadcast works on Sepolia
- smart-account sponsored live broadcast is validated on `sed-lite-sa-v2`
  with tx hash:
  `0x7a6c4c7ca36ce3b5ec875a3ccb6b37e79dcd2f48574c6dd679ded5513da7d5db`
- approval-based preview / estimation works on the validated EraVM fee-token
  path
- approval-based live broadcast works when both the fee token and paymaster are
  native EraVM deployments
- smart-account approval-based live broadcast is validated on `sed-lite-sa-v2`
  with tx hash:
  `0x2783de9185bcd6af21822c9c0ffa35e5329e96c8137ff41598d3cd001344ce8c`
- real hosted relay reapprove is now validated on `sed-lite-sa-v2` through the
  encrypted relay payload/browser path with request:
  `53328a56`
- the latest flagship post-fix native-send write-path acceptance now also sits
  on `sed-lite-sa-v2`
  with tx hash:
  `0x7904ecaad5edfee1f84dbdc4f83aaf2d577b7875fab060e8e272d7aa2697e7e0`

What remains constrained:

- approval-based compatibility is not generic for any ERC-20
- older EVM-interpreter token paths can still fail with `SystemContext`-style
  validation errors
- fee-token compatibility must be treated as a validated matrix, not inferred
  from ERC-20 compliance

### Bridge, deposit, withdraw, and swap status

Implemented and at least partially validated:

- `bridge`
  - supported `ethereum-sepolia <-> zksync-sepolia` route
  - status tracking
- `deposit`
  - preview
  - broadcast
  - status
- `withdraw`
  - preview
  - broadcast
  - status
  - finalize preview
  - finalize broadcast
- `swap`
  - Uniswap V3 exact-input-single request shaping
  - SyncSwap classic single-pool request shaping
  - allowance preflight and optional auto-approve
  - pool/router preflight and quote checks

Recent Sepolia validations already completed:

- live preview `smoke:product-path -- --wallet paymaster-eoa`
  now succeeds outside the sandbox and validates:
  - canonical operator-path preview
  - validated approval-based paymaster preview path
  - machine-readable `followups` and `nextCommands` aggregation
- live preview `smoke:operator-path -- --wallet paymaster-eoa --amount 0.00001`
  still succeeds outside the sandbox on the current branch and now returns:
  - `phase = goal-executed`
  - a top-level broadcast-ready `recommendedCommand`
  - the validated approval-based paymaster registry/default path in both the
    direct payload and the summarized follow-up metadata
- live preview `smoke:product-path -- --wallet paymaster-eoa`
  still succeeds outside the sandbox on the current branch and confirms that:
  - `operator-path` and `paymaster-success` both pass in preview mode
  - the aggregated `summary.followups` still preserve registry and agent
    follow-up metadata across the two-step product path
- the previous broken local `main` record was preserved as
  `main-broken-20260713`; its blocker state was a purely local wallet-record
  issue, not a new chain-side regression:
  - signer mismatch
  - undeployed smart-account state
- the healthy approval-based EOA record previously stored as `paymaster-eoa`
  has now been promoted back to local `main`
- live preview `smoke:operator-path -- --wallet main --amount 0.00001`
  now succeeds again outside the sandbox and confirms that the repaired local
  `main` baseline is usable for operator-path preview:
  - `phase = goal-executed`
  - a top-level broadcast-ready `recommendedCommand`
  - the validated approval-based paymaster registry/default path is resolved in
    the goal preview payload for `main`
- live preview `smoke:swap-success -- --wallet main`
  now succeeds outside the sandbox and confirms that:
  - the validated tracked-default SyncSwap path resolves directly from the
    registry
  - the preview reaches `goal-executed`
  - the live quote and allowance-preflight metadata are returned in the
    normalized payload
  - the smoke now defaults to `--paymaster-mode none`, so swap-path validation
    is not blocked by an incompatible wallet paymaster
- live preview `zk-agent workflow swap --wallet main --protocol uniswap-v3-exact-input-single ... --paymaster-mode none`
  now also succeeds outside the sandbox on a real Sepolia `WETH/TKA @ 3000`
  Uniswap V3 pool and confirms that:
  - the explicit-router/manual Uniswap path itself is live
  - the router resolves factory
    `0x8FdA5a7a8dCA67BBcDd10F02Fa0649A937215422`
  - the selected pair resolves pool
    `0x0676Dc17562adD8778213b872B680ec170D101cD`
  - but the current swap-registry model is still protocol-level, so this
    pair-specific evidence is not yet enough to promote the generic
    `uniswap-v3-exact-input-single` entry without overclaiming broader pair
    validation
- live preview `smoke:operator-path -- --wallet main --paymaster-mode none --amount 0.00001`
  now succeeds outside the sandbox and confirms that:
  - the top-level recommended workflow command preserves the explicit
    `--paymaster-mode none` override
  - the workflow goal preview resolves
    `zksync-sepolia-no-paymaster` as the paymaster registry entry
  - that registry entry now reports `status = validated` and
    `isValidatedDefaultForMode = true` for the EOA baseline
- live preview `smoke:operator-path -- --wallet sed-lite-sa-v2 --paymaster-mode none --amount 0.00001`
  now succeeds outside the sandbox and confirms that:
  - the same explicit `--paymaster-mode none` override works on the deployed
    `sed-lite-sa-v2` smart-account baseline
  - the workflow goal preview still resolves
    `zksync-sepolia-no-paymaster` as the paymaster registry entry
  - the path is now strong enough to treat `smart-account` as separately
    live-validated for the no-paymaster mode
- the tracked `zksync-sepolia-no-paymaster` registry entry is now promoted
  from supported to validated for both EOA and smart-account and becomes the
  current validated default for `--paymaster-mode none`
- live preview `smoke:product-path -- --wallet main`
  now succeeds outside the sandbox and confirms that:
  - `operator-path`, `paymaster-success`, and `swap-success` all pass in one
    product-level preview chain
  - the aggregated `summary.followups` preserve registry, agent, and next-step
    metadata across all three steps
- native L2 withdraw broadcast from `paymaster-eoa`:
  `0xea192d3fda23a747328c1d63b6d2e22664fd353511faf327ba8f28c408800ba8`
- `pnpm zk-agent withdraw-status --wallet main --tx-hash 0xea192d3fda23a747328c1d63b6d2e22664fd353511faf327ba8f28c408800ba8 --chain zksync-sepolia`
  now reaches `status = finalized`, with the enclosing L1 batch already
  `verified` and carrying `executeTxHash`
- `pnpm zk-agent withdraw-finalize --wallet main --tx-hash 0xea192d3fda23a747328c1d63b6d2e22664fd353511faf327ba8f28c408800ba8 --chain zksync-sepolia`
  now succeeds in preview mode and returns concrete `finalizeDepositParams`
  plus a `16`-hash Merkle proof; only the actual L1 finalize broadcast remains
  intentionally unvalidated
- `pnpm zk-agent tokens --wallet main --owned`
  now also surfaces per-token shared-bridge mapping status on zkSync chains;
  on the live `main` wallet, both held `ZKAT` balances resolve as
  `local-only-or-unmapped`, which matches the current `asset-id-mismatch`
  withdraw/bridge failures

### Connector UI status

The connector is no longer just a blank scaffold, but it is not yet product-
grade parity with the reference repo.

Current state:

- local approval round-trip exists
- waiting CLI process can consume approved local payloads
- `--await-local` flows are covered
- relay/manual approval is implemented end-to-end
- real public-relay remote-operator validation now exists on the current
  baseline, including browser-mediated encrypted-payload approval on
  `sed-lite-sa-v2`
- the connector now preserves the submitted encrypted payload/code pair for the
  active request, so relay polling/manual refresh does not drift the visible
  approval code away from the payload already posted to the relay
- the remaining gap is polish/hardening on the hosted path, not missing
  protocol coverage or missing real-user proof

## Known environment constraint

In the Codex sandbox used for this repo, public RPC hostname resolution is not
reliable.

Important rule:

- if `sepolia.era.zksync.dev` or another public RPC fails inside the sandbox,
  do not treat that as proof that the endpoint is down
- retry from the host shell or an approved unsandboxed command before drawing a
  conclusion

## Main gap versus `polygon-agent-cli`

The remaining gap versus the local `../polygon-agent-cli` reference is no
longer raw chain mechanics. The shortfalls that still matter are:

1. public install and onboarding clarity:
   the product still asks the operator to understand more about package vs
   repo vs skill entrypoints, connector assumptions, and when `.env` matters
   than the reference repo asks of its users
2. hosted relay productization:
   the path is proven, but the current relay remains a file-backed prototype
   instead of a clearly operated service baseline
3. release/version/doc discipline:
   package publishing works, but the release path is still manual enough to
   let version/tag/document drift slip through after publish
4. discovery and asset abstraction polish:
   the defaults/token-registry structure is real, but the product still needs
   easier token/asset/position discovery around the canonical validated paths

Important counterpoint:

- `zk-agent-cli` is already ahead in workflow explicitness
- relay/manual approval recovery is deeper than the reference baseline
- zkSync-native AA/paymaster/policy handling is richer than the Polygon
  reference

So the remaining work is the public-facing product shell, not missing core
execution capability.

## Deferred product areas

Active order:

1. broader DeFi / ERC-20 breadth, only when explicitly resumed
2. ecosystem-specific vertical workflows, only if real zkSync-native demand
   justifies them
3. broader identity / reputation framework, only if the current local-first
   profile model stops being enough
4. passkey / multisig / broader AA module expansion, only after the default
   single-operator path is settled
5. broader ZK Stack chain expansion, only after the zkSync Era baseline is
   materially more mature

## Most important files to read first

Start here:

- [README.md](./README.md)
- [PLANS.md](./PLANS.md)
- [AGENTS.md](./AGENTS.md)

Then read the current implementation boundary:

- [packages/zk-agent-cli/src/commands/workflow.ts](./packages/zk-agent-cli/src/commands/workflow.ts)
- [packages/zk-agent-cli/src/commands/operations.ts](./packages/zk-agent-cli/src/commands/operations.ts)
- [packages/agent-core/src/workflow-run.ts](./packages/agent-core/src/workflow-run.ts)
- [packages/agent-tools/src/create-toolset.ts](./packages/agent-tools/src/create-toolset.ts)
- [packages/provider-zksync-wallet/src/provider.ts](./packages/provider-zksync-wallet/src/provider.ts)
- [packages/provider-zksync-defi/src/index.ts](./packages/provider-zksync-defi/src/index.ts)
- [packages/account-profiles/src/profiles.ts](./packages/account-profiles/src/profiles.ts)

## Practical restart checklist

When resuming work in a new environment:

1. Run `pnpm install`.
2. Confirm the root `.env` still points to the intended Sepolia resources.
3. Run `pnpm typecheck`.
4. Run `pnpm build`.
5. Run the smallest relevant tests for the area you are touching.
6. If chain verification is needed, prefer an unsandboxed host-shell command
   when sandbox DNS is suspect.
