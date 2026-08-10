# zk-agent-cli Project State

## Snapshot

- Last updated: 2026-08-10
- Latest commit at write time: `c5b2006`
- Current branch: `main`
- Working tree status when this document was written: dirty with the completed
  session/signer separation closeout, matching docs/help alignment, and the
  final state-document refresh

## Current phase

Phase 5 is complete on the current baseline.

This means:

- the zkSync-native engineering baseline already exists
- Phase 3 is complete
- Phase 4 is also complete on the current baseline
- the package-first install surface, hosted relay proof, zk-native flagship
  path, release discipline, and product-slice skill split are now all part of
  the closed baseline for this stage
- the active work now sits in post-Phase-5 hardening and explicit backlog,
  not in any still-open Phase 5 execution thread
- broader DeFi breadth remains deferred unless explicitly resumed
- the main reference point is still `../polygon-agent-cli`, but only for
  reusable product patterns

### Phase 3 closeout summary

Phase 3 is complete.

Closed results:

1. the default operator path is explicit and aligned across docs, CLI, and
   workflow guidance
2. the repository ships an installable agent-facing `skills/` surface
3. relay-capable remote approval is part of the shipped baseline
4. workflow-first operator entrypoints are in place for the common actions
5. defaults and registries are machine-readable and wired through CLI/tool
   follow-up contracts

### Phase 4 closeout summary

Phase 4 is complete on the current baseline.

Closed results:

1. public beta publish is complete:
   `zk-agent-cli@0.1.0-beta.5` is live, and both npm dist-tags `beta` and
   `latest` currently point to that version
2. discovery/default/token inspection is productized:
   operators no longer need deployment-file tribal knowledge for the normal
   inspection path
3. the current non-deferred defaults breadth bar is met:
   one real canonical Sepolia ERC-20 deposit baseline exists and L1 allowance
   handling no longer blocks deposit broadcast
4. relay-backed remote approval is a shipped path:
   dedicated smoke coverage and stable top-level follow-up contracts exist
5. no dedicated zkSync-native vertical is justified:
   that is an explicit product decision, not unfinished work

### Post-Phase-5 follow-on priorities

Current ordered priorities:

1. hosted remote approval hardening beyond the current file-backed prototype
2. flagship AA real-user proof on a public relay
3. operator-informed polish on the packaged flagship workflow and relay UX
4. broader DeFi breadth only when it is explicitly resumed
5. optional connector/approval UX polish when live operator usage justifies it

Current concrete interpretation of those priorities:

Completed architecture baseline to keep in mind:

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
2. flagship AA real-user proof on a public relay
   - move beyond the synthetic hosted smoke and prove one real
     browser-mediated `wallet create|reapprove --wait-relay --prompt-code`
     path followed by `workflow pay`
   - current groundwork now exists in the smoke layer itself:
     `smoke:remote-approval --manual-approval` can stop after relay publish
     with `shareUrl` / `statusUrl` / `recommendedCommands` for a real browser
     operator, or wait and finalize after a supplied 6-digit approval code
3. packaged flagship UX polish
   - narrow the top-level operator surfaces that matter most in real usage:
     `next`, `wallet create|reapprove`, `relay serve`, and `workflow pay`
4. DeFi breadth only on explicit restart
   - do not let broader swap/deposit/withdraw breadth silently reclaim the
     default roadmap without a deliberate product decision

### Phase 5 closeout detail

- the hosted remote-approval baseline now has an explicit relay compatibility
  probe through `zk-agent relay inspect --relay-url <url>`
- the local relay prototype now also accepts `--public-origin <https-url>` so
  share/status URLs can be emitted for a real hosted/tunneled address instead
  of only the local bind origin
- `relay inspect` / `relay serve` now also tell the operator when the
  advertised `publicOrigin` still looks local-only and whether hosted
  share-link approval is actually ready, so hosted deployment mistakes are not
  hidden behind a raw health payload
- the published CLI package now also bundles the connector UI build used by
  `relay serve`, so the hosted share-link path no longer depends on a source
  checkout just to serve the approval UI
- the remaining hosted gap is no longer "how does the CLI talk to a relay at
  all"; it is live validation and hardening of a real hosted deployment
- the current flagship AA operator path now also has a dedicated smoke:
  relay-backed wallet reapproval on an existing wallet followed immediately by
  the paymaster-backed flagship native-send path on that same wallet
- the flagship AA path is now also productized as a first-class CLI entrypoint:
  `zk-agent workflow pay --wallet <name> --to <address> --amount <amount>`
  wraps the current validated native-send story with checkpoint persistence,
  execute-when-ready orchestration, intent-scoped session recovery defaults,
  and approval-based paymaster mode by default
- the same flagship path now also reaches the machine-facing tool surface:
  `packages/agent-tools` exposes `workflowPayTool`, `tool:list` now marks it
  as the recommended guided-execution entry, and the flagship operator/path
  smokes now point at `workflow pay` instead of the older long
  `workflow auto --intent send-native` command shape
- wallet-ready `zk-agent next` and the matching top-level agent tool now also
  default their fallback `nextCommand` / `recommendedCommands.nextAction` to
  `workflow pay`, while keeping `workflowAuto` available as the broader
  multi-intent guided path
- that flagship smoke now also hardens the external-relay variant:
  when `--relay-url` is supplied it first validates the hosted relay itself
  before attempting reapproval, instead of assuming any externally supplied
  URL is already safe to use as the flagship operator path
- the release-discipline baseline is slightly stronger:
  `packages/zk-agent-cli/scripts/release-check.mjs` now enforces the minimum
  standalone package-README contract for install paths, shortest path, relay
  path, storage path, and common repair guidance
- the release-discipline baseline now also covers a clean-machine-like
  tarball install smoke:
  `release:check` installs the packed tarball into a temporary project outside
  the repository with `pnpm add --offline` and verifies the installed
  `zk-agent` / `zksync-agent` binaries plus the basic JSON surfaces there
- the release-discipline baseline now also verifies the installed hosted-relay
  path:
  the temporary tarball install must be able to run `relay serve` with a
  hosted `--public-origin`, report `connectorUiAvailable: true`, and expose the
  same readiness through the relay health payload
- the release-discipline baseline now also hard-fails on publish-runtime drift:
  `packages/zk-agent-cli/scripts/assert-release-runtime.mjs` is now the first
  step of `release:check`, so Node `<24` or a `pnpm` version mismatch fail
  before build/package work even starts
- the packaged-install README contract is now slightly tighter too:
  `release:check` also enforces that the package README names the supported
  Node runtime floor and the real `~/.zk-agent/workflows/*.json` checkpoint
  path instead of letting those packaged-user details drift away from the code
- the package-first follow-through now also reaches the CLI help layer:
  `wallet --help` uses the same relay-backed shortest path as the packaged
  README and quickstart, so the canonical hosted approval flow is no longer
  split between help text and package docs
- the hosted-relay baseline now also verifies the share-link entrypoint itself:
  relay CLI tests and `release:check` both create a real relay request,
  confirm `/r/<id>` redirects to `/?relayRequestUrl=...` with the advertised
  public origin embedded in the query, and confirm the bundled connector UI
  landing page plus its hashed JS asset still serve correctly from the relay
- the hosted-relay baseline now also has a dedicated repo-local smoke for real
  external deployments:
  `pnpm smoke:hosted-relay -- --relay-url <url>` reuses the real CLI
  `relay inspect` contract, publishes a synthetic request, and validates the
  hosted share-link/UI path against a caller-supplied external relay URL
- the relay-backed approval smoke now also has a real browser/share-link mode:
  `pnpm smoke:remote-approval -- --wallet <name> [--relay-url <url>] --manual-approval`
  no longer posts a synthetic encrypted approval itself, and can either stop
  after publish with machine-readable `shareUrl`, `statusUrl`, and explicit
  relay follow-up commands or wait for readiness and finalize after a real
  6-digit approval code is supplied
- real hosted deployment validation is no longer blocked on public reachability:
  on `2026-08-07`, a public frp-backed relay URL was validated end to end with
  the real `relay inspect` contract and `pnpm smoke:hosted-relay`, including
  `/health`, share-link redirect, and bundled connector UI asset delivery
- the remaining hosted gap is now narrower and more honest:
  the outside-in proof exists, but the validated deployment is still the
  current file-backed hosted prototype rather than a more durable operated
  relay baseline
- the product-slice skill work has started for real:
  `skills/zk-aa/SKILL.md` now isolates the current flagship AA/operator path
  instead of forcing that guidance to stay embedded inside the repo-level
  skill only
- the skill surface now also includes a focused relay slice:
  `skills/zk-relay/SKILL.md` isolates hosted remote approval, relay readiness
  checks, share-link validation, and manual relay fallback instead of leaving
  that path diffused across the repo-level skill and hosted prototype runbook
- the package-first doc follow-through now also covers the DeFi skill:
  `skills/zk-defi/SKILL.md` and the root README operator-path examples now
  default to the packaged `zk-agent` entrypoint and only fall back to
  `pnpm zk-agent` when the operator is intentionally using a source checkout
- the release-readiness baseline is now proven end to end on the supported
  host runtime:
  `pnpm validate:release` passed on `2026-08-07` under Node `24.14.1` and the
  workspace-declared `pnpm@10.30.3`, including `release:check`,
  `@zk-agent/agent-tools` tests, and `zk-agent-cli` tests
- the only failed validation observed in this closeout was environmental, not
  product-level:
  the managed sandbox blocked registry DNS during the clean-machine tarball
  install smoke, while the same gate passed when rerun outside that restricted
  network environment

Phase 3 execution detail was intentionally removed from this state file after
closeout. The remaining work now sits in post-Phase-5 follow-on or explicit
deferred backlog, not in any open Phase 3 thread.

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
- hosted relay reapprove now also preserves the locally writable session on a
  previously healthy control wallet (`daily-spend-limit-sa-v2`), while the
  final post-fix native-send write-path acceptance remains on `sed-lite-sa-v1`
  with tx hash:
  `0x06f83d60bb858eb96c64cf6e9f2b55ba3e90838dabb8b09a1dc61d3a97bc5b1d`

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
- the remaining gap is product-level remote-operator validation and UX polish,
  not the absence of a relay path

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

1. release discipline after the first public beta:
   clean-machine install smoke, dist-tag policy, and runtime-floor policy
2. broader asset / defaults breadth:
   the baseline is real, but breadth beyond the current canonical paths is
   still deferred work
3. optional product-layer polish:
   only if real operator usage shows gaps

Important counterpoint:

- `zk-agent-cli` is already ahead in workflow explicitness
- relay/manual approval recovery is deeper than the reference baseline
- zkSync-native AA/paymaster/policy handling is richer than the Polygon
  reference

So the remaining work is follow-up breadth and product polish, not missing core
execution capability.

## Post-Phase-5 deferred backlog

Active order:

1. broader DeFi / ERC-20 breadth, only when explicitly resumed
2. extra connector polish beyond the hosted baseline, only if live usage shows
   friction

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
