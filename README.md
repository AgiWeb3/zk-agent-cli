# zk-agent-cli

`zk-agent-cli` is a local-first monorepo for building an agent-oriented CLI on top of `zkSync Era` and the wider `ZK Stack`.

Current handoff snapshot:

- [PROJECT_STATE.md](./PROJECT_STATE.md)

Agent-facing entrypoint:

- [skills/SKILL.md](./skills/SKILL.md)
- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [skills/zk-aa/SKILL.md](./skills/zk-aa/SKILL.md)
- [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

The project is intentionally modeled after the real architecture of `polygon-agent-cli`, but it is not a direct fork. The goal is to preserve the reusable system shape:

- CLI entrypoint for humans and agent harnesses
- browser connector UI for session approval
- shared protocol package for session payloads, relay messages, and crypto
- core package for storage, chain registry, and provider interfaces
- provider packages for zkSync-specific wallet and DeFi capabilities
- agent tool adapters for LLM / framework integration

## Install Surfaces

There are now two explicit install surfaces:

- repo-local development and daily project use:
  - `pnpm install`
  - `pnpm zk-agent --help`
- packaged CLI release target:
  - `npx zk-agent-cli --help`
  - `npm install -g zk-agent-cli`
  - binaries: `zk-agent`, `zksync-agent`

Current status:

- the current public beta, `zk-agent-cli@0.1.0-beta.4`, was published on
  `2026-08-04`
- the local workspace is aligned with the current published package version:
  `zk-agent-cli@0.1.0-beta.4`
- release validation remains local and explicit through
  `pnpm validate:release`
- the public npm dist-tags are currently aligned:
  `beta -> 0.1.0-beta.4`, `latest -> 0.1.0-beta.4`
- inside this repository, the repo-local `pnpm zk-agent ...` path remains the
  default development/runtime surface; the npm install surface is now live for
  external use

## Current Phase

The project has moved past scaffolding and isolated chain experiments.

Current stage: `Phase 5: productization to parity`.

What that means:

- the zkSync-native engineering baseline already exists
- Phase 3 productization/parity exit is complete:
  - default operator path is aligned across README, CLI, tools, and follow-up commands
  - installable `skills/` surface exists
  - relay-capable remote approval is now covered by an explicit product-level smoke path
  - workflow-first operator entrypoints cover the common actions
  - registry-backed validated defaults are documented and machine-readable
- Phase 4 product hardening is also complete on the current baseline:
  - the first public beta is published
  - the defaults/discovery surface is productized
  - one canonical Sepolia ERC-20 deposit baseline is live-validated
  - relay-backed remote approval is a shipped path
- the active work is now Phase 5:
  - release discipline and package-first standalone usability
  - a stronger hosted remote-approval baseline
  - one clearer zk-native flagship workflow built around AA, paymaster, and
    workflow orchestration
- the agent-facing skill surface is now split into stable product slices:
  `zk-aa` for the current AA/operator path and `zk-defi` for the current DeFi
  action reference
- the vertical-workflow review is also complete on the current baseline:
  no zkSync-native first-class vertical has enough repeated operator evidence
  yet to justify a dedicated command family

What is already in place:

- workspace structure
- provider boundaries
- local storage model
- session protocol package
- built-in AA profile registry in `packages/account-profiles`
- initial Commander-based CLI commands
- local wallet record maintenance via `wallet rename`
- local `packages/paymaster-test-assets` utility package for compiling and deploying paymaster test assets on zkSync Sepolia
- `defaults` for a machine-readable registry view of the built-in chains plus the supported, validated, experimental, and manually configured zkSync Sepolia defaults
  including a top-level `surfaceMatrix` that summarizes the current validated
  default swap, bridge, and paymaster paths, plus `defaultSelections` so
  callers can read the resolved default/fallback entries directly without
  re-joining `entryId` values by hand, plus `resolvedCatalog` so callers can
  consume the full resolved validated/supported/experimental candidate set for
  each surface without rebuilding those joins themselves, a local token
  registry view derived from `packages/paymaster-test-assets/deployments`, and token-registry source
  metadata that shows the active local-first resolution order; the paymaster
  registry now also tracks the validated Sepolia sponsored path alongside the
  approval-based EraVM default and experimental comparison entries, including
  mode-aware sponsored vs approval-based paymaster defaults, with the current
  sponsored path now live-validated for both EOA and smart-account execution,
  while the swap
  registry/default selection surface now also carries the tracked validated
  SyncSwap pair and pool metadata directly, the bridge default selection
  surface now exposes chain IDs, asset coverage, asset-constraint metadata,
  and finalize requirements for the validated Sepolia route pair, and the
  registry now also exposes explicit token-role entries for tracked
  validated/experimental swap and paymaster token paths
- swap / bridge / paymaster execution results now also expose structured
  `registry` resolution metadata, so callers can distinguish validated defaults,
  tracked routes, and manual fallbacks without scraping `notes`
- `wallet next` and `workflow` planning now surface registry-backed breadth in
  operator-facing notes, including alternative validated paymaster candidates
  and supported-but-not-yet-validated swap fallbacks where applicable
- `zksync-ethers` read path for balances and contract calls
- `balances` now supports:
  - stored-wallet default chain reads
  - single-chain override
  - multi-chain aggregation across the built-in zkSync chain registry
  - optional registry-backed ERC-20 discovery through `--owned-tokens`
- `assets` as the opinionated single-chain asset view:
  - native balance plus registry-backed ERC-20 holdings in one command
- thin AA-oriented transaction commands for:
  - `fund` with route-aware funding guidance for the active chain, including optional concrete `deposit` / `bridge` command suggestions when amount or token context is provided
  - `fund --execute` to dispatch onto the validated `deposit` or `bridge` path instead of only printing guidance
  - `send`
  - `send-token`
  - write-mode `call`
  - preview outputs now include concrete broadcast-ready `next` commands instead of only generic `--broadcast` hints for the supported send / call / swap / bridge / deposit / withdraw / withdraw-finalize paths
- `wallet status` inspection for:
  - execution address vs owner address
  - session signer consistency
  - deployed vs undeployed smart-account state
  - local write readiness blockers
  - the shortest remediation path for local execution
- `next` as the top-level operator entrypoint, so one command can route the user to `setup`, wallet bootstrap/recovery, or the next workflow checkpoint action
- `agent status|show|set|export|import|clear` for local-first agent identity metadata, so operator tooling can persist and move one stable profile without pretending a zkSync-native onchain reputation standard already exists
- `next`, `workflow`, and the matching agent-tools workflow/top-level outputs now also surface `agentProfile` plus machine-readable `agentFollowup`, so callers can tell whether the local operator identity is missing, only needs inspection, or should be relinked to the active wallet, while wallet-ready top-level routing now also points at local asset and token discovery instead of assuming the operator already knows which token surface to inspect
- `wallet next` for the shortest next-step CLI guidance, combining status, sync/deploy/reapprove hints, funding detection, and direct `assets` / `tokens --owned` / `tokens --chain` / `resolve-token` follow-ups into one operator-facing summary
- `workflow plan` for higher-level action sequencing, so one command can spell out the prerequisite and execution steps for `send`, `swap`, `bridge`, `deposit`, and `withdraw`, now fills the current registry-backed default swap/bridge path when the tracked route is unambiguous, returns JSON `recommendedCommands` for the immediate operator follow-up, and prints the same asset/token discovery follow-ups in TTY mode when token resolution matters
- workflow `plan` / `status` / `next` / `run` outputs now surface structured registry summaries in the TTY layer as well, and their `recommendedCommands` consistently include `zk-agent defaults` as the machine-readable registry escape hatch
- `workflow fund` as a workflow-first alias for the default funding step, so the canonical operator path no longer has to jump back out to the top-level `fund` command family
- `workflow start` for persisting a local workflow checkpoint keyed by `requestId`, so longer-running flows can resume without re-entering the full goal payload
- `workflow run` for bounded orchestration: it can auto-sync local metadata, dispatch a separate funding step when gas is missing, and only executes the goal action once the wallet is actually ready
- `workflow auto` for guided orchestration from either fresh goal input or a stored checkpoint, so one command can inspect readiness, optionally persist a checkpoint, resolve wallet-session blockers, and execute immediately when the workflow is ready
- `workflow next` for the shortest next-step CLI guidance at the workflow layer, from either fresh goal input or a stored checkpoint
- tokenized `workflow status|next|auto|resume|run` JSON outputs now also surface `discoverAssets`, `discoverOwnedTokens`, `discoverTokens`, and `inspectToken` follow-ups alongside the concrete next action, and the same workflow commands now print those follow-ups directly in TTY mode, so operator tooling does not need to infer local token-registry recovery paths from free-form notes
- `zk-agent next --request-id <id>` now mirrors that tokenized workflow follow-up shape for stored checkpoints, including `discoverAssets`, `discoverOwnedTokens`, `discoverTokens`, and `inspectToken` when the checkpoint intent depends on token resolution
- intent-specific workflow shortcuts such as `workflow send-native`, `workflow swap`, and `workflow bridge`, so the common execution path no longer has to repeat `run --intent ...`
- `workflow status|run|resume --ensure-wallet-session [--await-local] [--relay-url <url>]` for connector-backed recovery when a workflow is blocked only because the local writable session is missing or stale, now with local callback, manual payload-return, and one-step relay publish plus relay status/approve guidance
- the same workflow ensure-wallet-session path now also accepts `--session-preset`, `--session-hours`, `--allow-transfer-to`, `--allow-contract`, `--disallow-transfers`, and `--disallow-contract-calls`, so guided workflow recovery can request a constrained session instead of always reopening a broad default session; `--session-preset intent` can derive the narrowest default from the workflow goal
- workflow checkpoint and JSON command outputs now distinguish the long-lived `workflowRequestId` from any temporary connector `walletRequestId`
- relay-backed `workflow status|next|auto|resume|run` JSON outputs now also surface top-level `walletApprovalRelay` and `walletApprovalRecommendedCommands` aliases, so remote approval callers do not need to unpack the nested `walletApproval` object just to continue the flow
- `workflow` write intents now also preserve explicit paymaster overrides for the supported send / call / swap goal types, so checkpointed execution can replay the same fee-payment mode later
- `workflow` and `wallet next` now treat supported paymaster-backed smart-account writes as gas-satisfied even when the stored native balance is zero, so `send` / `send-token` / `call` / `swap` do not get blocked behind an unnecessary fund step before paymaster validation is attempted
- on `zksync-sepolia`, approval-based paymaster mode can now fall back to the tracked validated paymaster + EraVM fee-token defaults when the wallet or workflow only specifies the mode and omits the explicit address/token
- on `zksync-sepolia`, sponsored paymaster mode can now fall back to the tracked validated sponsored paymaster address when the wallet or workflow only specifies the mode, so the same paymaster-ready/no-fund path works for sponsored sessions too
- `workflow status|next|resume` for checking whether a previously prepared workflow is still blocked, still waiting on funding, or ready to continue, with optional `--request-id` loading from the stored checkpoint
- `workflow` bridge goals now resolve the tracked validated destination route automatically when the stored wallet chain makes the default path unambiguous, so `workflow plan|status|next|run|auto` can emit and reuse concrete bridge commands without forcing `--to-chain` every time
- `workflow list|show|update|delete` for local checkpoint inspection, runtime-setting adjustments, and cleanup, so longer-running operator flows do not accumulate opaque local state
- `wallet sync` for refreshing local smart-account metadata from deployed onchain state, including saved built-in profile context such as `sed-lite`
- `wallet export|restore` for portable local wallet backups and recovery across machines, with optional post-restore resync against deployed onchain state
- `wallet reapprove --await-local` for reacquiring a writable local session after restore without dropping recovered smart-account metadata
- local connector approval loop support via:
  - `wallet create --await-local`
  - `wallet create|reapprove --session-preset <preset> --session-hours <hours> --allow-transfer-to <address> --allow-contract <address> --disallow-transfers --disallow-contract-calls` for explicit session guardrails at request time, with `reapprove` preserving the current stored permissions by default when no override flags are supplied
  - `wallet create --relay-url <url>` / `wallet reapprove --relay-url <url>` for one-step remote approval publishing
  - `wallet create --relay-url <url> --wait-relay --prompt-code` / `wallet reapprove --relay-url <url> --wait-relay --prompt-code` for a single CLI invocation that waits for relay readiness and then finishes after one approval-code entry
  - `wallet create|reapprove --relay-url <url> --wait-relay --code <code>` for the same relay-completion path in non-interactive automation
  - `relay inspect --relay-url <url>` for checking whether an external relay advertises the expected zk-agent compatibility contract, whether its advertised `publicOrigin` still points at localhost, and whether hosted share-link approval is actually ready before using it as a hosted approval path
  - `pnpm smoke:hosted-relay -- --relay-url <url>` from a source checkout when you want one bounded external hosted-relay proof that reuses the real CLI `relay inspect` surface, creates a synthetic relay request, and verifies the share-link redirect plus bundled connector UI asset path end to end
  - auto-consume of approved local requests
  - `wallet request await-local`
  - `wallet request approve --payload ...` for non-colocated/manual connector return
  - `relay serve --public-origin <https-url>` + `wallet create|reapprove --relay-url <url>` + `wallet request relay-status|approve` for the local file-backed hosted relay prototype when it sits behind a tunnel or reverse proxy; detailed operator runbook: [docs/12-hosted-relay-prototype.md](./docs/12-hosted-relay-prototype.md)
  - the packaged CLI now also bundles the connector UI build used by `relay serve`, so hosted share-link approval no longer depends on a separate source checkout just to serve the UI
  - relay-backed connector pages now show share/status URLs, auto-refresh pending approval state, and reflect encrypted submission immediately
  - `wallet request list` with expired-request pruning
  - connector callback handoff back into the waiting CLI process
  - wallet/request JSON outputs now also expose a top-level `nextAction`, and
    relay-backed outputs also expose top-level relay request/share/status
    aliases, so remote callers do not have to infer the single next step from
    nested objects
- first agent-facing tool surface in `packages/agent-tools` for:
  - local agent profile read/write/export/import through `getAgentProfileTool`, `setAgentProfileTool`, `exportAgentProfileTool`, and `importAgentProfileTool`
  - funding guidance, including route-aware suggested commands
  - top-level next-step guidance across setup, wallet readiness, and stored workflow checkpoints
  - workflow-first funding execution that reuses the validated deposit / bridge path when execution is requested
  - intent-specific workflow wrappers for `send-native`, `send-token`, `call-write`, `swap`, `bridge`, `deposit`, and `withdraw`
  - bounded workflow execution for concrete write intents
  - workflow status inspection for resume-safe orchestration
  - workflow next-step guidance from fresh goal input or a stored checkpoint
  - structured workflow follow-up commands aligned with the CLI, including token-registry recovery fields such as `discoverAssets`, `discoverOwnedTokens`, `discoverTokens`, and `inspectToken` for tokenized intents
  - `workflowAutoTool` / `workflowOrchestratorTool` now expose workflow follow-up commands separately from wallet-approval follow-up commands, so callers do not have to infer whether `recommendedCommands` refers to wallet session recovery or workflow continuation
  - create wallet request
  - create stored wallet approval request
  - approve stored wallet request, including relay-backed encrypted approval fetch / wait
  - unified wallet approval orchestration for create / reapprove / approve flows, with optional relay auto-publish, relay wait/finalization, or immediate payload finalization in one tool call
  - wallet reapprove
  - wallet status
  - wallet next-step guidance
  - workflow planning for concrete write intents
  - unified workflow orchestration from fresh goal input or stored checkpoint, with optional checkpoint persistence and execute-when-ready behavior
  - workflow orchestration can now auto-create a local reapproval request when a missing writable session blocks execution, auto-publish it to a relay when requested, wait for relay approval readiness when given the approval code, and continue straight through to goal execution when an approved payload is supplied in the same tool call
  - workflow orchestration now also surfaces the wallet request id plus relay share/status metadata as top-level tool output aliases, so remote approval callers do not need to unpack the nested walletApproval object just to continue the flow
  - bounded workflow execution with separate funding-step dispatch
  - local workflow checkpoint lifecycle management for start/list/get/update/delete
  - workflow status / next-step guidance / execution directly from stored checkpoint `requestId`
  - wallet sync
  - wallet export
  - wallet restore
  - single-chain asset view with registry-backed ERC-20 discovery
  - balances
  - defaults / registry readout for supported, validated, experimental, and manual paths
  - contract read
  - same-chain swap preview / broadcast for the registry-backed validated default path plus explicit protocol overrides
  - bridge preview / broadcast / status for the supported Sepolia L1 <-> zkSync route
  - deposit preview / broadcast / status
  - native send
  - token send
  - withdraw preview / broadcast / status / finalize preview / finalize broadcast
  - contract write
  - smart-account plan/deploy wrappers
  - default `createZkSyncAgentTools()` / `createZkSyncAgentToolContext()` factories
  - `pnpm tool:list`
  - `pnpm tool:run -- --tool <toolName> --input <json|@file>`
  - `tool:run -- --list` now surfaces high-frequency entries first, adds a `group` field for coarse functional area, returns the closest `cliCommand` equivalent for each tool, marks `workflowAutoTool` as the recommended guided workflow entry, and keeps `workflowOrchestratorTool` as its compatibility alias
  - agent-tools `tool:run` and `smoke:*` entrypoints now load the same local `.env` file as the main `zk-agent` CLI, so live RPC overrides do not diverge between the two surfaces
  - `pnpm smoke:readonly -- --wallet <name> [--call-to <address> --call-data <hex>]` for real provider read-only smoke, now returning both the preferred single-chain `assets` view and the raw `balances` view
  - `pnpm smoke:discovery -- --wallet <name> [--symbol <symbol>]` for focused CLI discovery/default inspection smoke, validating the real `defaults` / `assets` / `balances --owned-tokens` / `tokens --owned` / `tokens --chain` / `resolve-token` JSON path in one bounded read-only sequence
  - `pnpm smoke:hosted-relay -- --relay-url <url>` for bounded outside-in validation of an externally reachable hosted relay: the smoke runs the real `relay inspect`, publishes a synthetic request, confirms `/r/<id>` redirects into the connector UI, and confirms the bundled hashed frontend asset still serves from the relay
  - `pnpm smoke:operator-path -- --wallet <name> [--to <address>] [--amount <native>] [--paymaster-mode none|approval-based|sponsored]` for preview-only validation of the canonical `next -> wallet -> workflow auto -> funding fallback or goal preview` operator path on one stored wallet, now also surfacing a top-level `phase` / `recommendedCommand` plus the resolved workflow registry/default-path summary and relay approval metadata in its JSON payload
  - `pnpm smoke:remote-approval -- --wallet <name> [--chain <chain>] [--relay-url <url>]` for the explicit create -> relay-publish -> relay-status -> relay-approve -> wallet-import product path, using a local in-process relay by default and a caller-supplied relay when `--relay-url` is present
  - `pnpm smoke:flagship-workflow -- --wallet <name> [--relay-url <url>] [--paymaster-mode approval-based|sponsored] [--execute]` for the current Phase 5 flagship AA path: when `--relay-url` is supplied it first validates the external hosted relay, then runs relay-backed wallet reapproval, then the paymaster-backed workflow-auto send-native path on the same wallet
  - `pnpm smoke:lifecycle -- --wallet <name>` for export -> restore -> reapprove -> write-ready recovery smoke
  - `pnpm smoke:policy -- --wallet <name>` for live preview validation of SED policy rejections and normalized tool-error remediation hints
  - `pnpm smoke:paymaster-success -- --wallet <name> [--execute]` for the validated EraVM approval-based workflow-backed send-native preview / broadcast path, now defaulting to mode-only paymaster input so the tracked validated fallback address/token are exercised directly
  - `pnpm smoke:swap-success -- --wallet <name> [--amount-in <amount>] [--amount-out-min <amount>] [--paymaster-mode <mode>] [--execute]` for the validated default workflow-backed swap path, now resolving the tracked default router/factory/token pair directly from the registry and defaulting to `--paymaster-mode none` so the swap route can be validated independently from wallet paymaster compatibility
  - `pnpm smoke:withdraw-followup -- --wallet <name> --tx-hash <hash> [--execute]` for withdraw-status -> finalize-preview / finalize-broadcast follow-up on a previously broadcast L2 withdraw
  - `pnpm smoke:broadcast -- --wallet <name> --execute` for the opt-in live legacy fee-token incompatibility smoke, which may now fail during estimation or broadcast depending on current Sepolia behavior
  - built `dist` entrypoints now also run directly, for example `node packages/agent-tools/dist/run-tool.js --list`
  - tool errors now also expose normalized validation `classification` and
    `suggestedAction` fields when the provider returns a known structured
    rejection, including:
    - paymaster validation failures
    - direct transaction validation failures such as SED native-cap hook rejects
- `wallet paymaster set` for updating saved default paymaster metadata on a
  stored wallet
- generic `wallet smart-account predict|deploy` flow for:
  - artifact-driven address prediction
  - account deployment via `createAccount` / `create2Account`
  - saving the deployed execution address back into the local wallet record
- first built-in smart-account profile:
  - `sed-lite`
  - source checked into the workspace
  - CLI profile discovery via `wallet smart-account profiles`
  - profile-specific account management via
    `wallet smart-account sed-lite owner|owner-set|validator|validator-set|module|module-add|module-remove|hook|hooks|hook-add|hook-remove|limit|limit-set|limit-remove|native-cap-hook|target-allowlist-hook|selector-allowlist-hook`
  - preview outputs for the built-in profile write commands now include concrete rerun commands with the same wallet/profile/paymaster arguments plus `--broadcast`
  - JSON outputs for those write commands now also include structured `recommendedCommands`, including preview rerun guidance plus generic `wallet status` / `wallet next` follow-ups
- second built-in smart-account profile:
  - `daily-spend-limit`
  - source checked into the workspace
  - CLI profile discovery via `wallet smart-account profiles`
  - profile-specific limit management via
    `wallet smart-account daily-spend-limit show|set|remove`
- zkSync-native transaction previews for type `113` requests
- paymaster metadata wiring for:
  - session approval payloads
  - CLI command selection
  - preview output
  - structured JSON errors when live provider support is missing
- live paymaster transaction preparation for:
  - General flow (`sponsored`)
  - zkSync testnet ApprovalBased flow with automatic testnet paymaster resolution
- `deposit` support through `packages/provider-zksync-defi`, including:
  - L1 -> L2 deposit transaction preview
  - gas estimation for the deposit path
  - opt-in L1 deposit broadcast for locally writable sessions
  - post-broadcast L1 and mapped L2 lifecycle inspection, including wait-mode polling in the CLI
  - explicit L1 signer and RPC requirements for the deposit path
- `bridge` support through `packages/provider-zksync-defi`, including:
  - route-aware dispatch onto the validated `deposit` / `withdraw` paths
  - the currently supported `ethereum-sepolia <-> zksync-sepolia` bridge pair
  - machine-readable route metadata and post-broadcast status-command hints
  - tracked default destination-route resolution for the direct `bridge` CLI path, so `--to-chain` can be omitted when the stored wallet chain maps to one unambiguous validated route
  - unified `bridge-status` inspection on top of the deposit / withdraw lifecycle trackers
  - preserved lifecycle-specific next-step guidance in `bridge-status`, including deposit polling and withdraw finalization follow-up
- `swap` support through `packages/provider-zksync-defi`, including:
  - same-chain `Uniswap V3 exactInputSingle` and `SyncSwap classic` single-pool request shaping
  - explicit router / token / protocol input instead of hidden quote aggregation
  - tracked SyncSwap classic router / factory defaults, and direct `swap` now also defaults to the current registry-backed validated swap path when `--protocol` is omitted
  - CLI-side fallback to local test-asset deployment records for token `decimals` / `symbol` lookup during swaps, token sends, and ERC-20 bridge/withdraw/deposit previews, so repeated Sepolia test runs do not always need manual decimal flags
  - allowance preflight with optional auto-approve before swap broadcast
  - router-factory pool preflight, so missing V3 pools fail before any approval transaction is sent
  - direct SyncSwap classic pool quoting before broadcast, so impossible `amountOutMin` values fail before any approval transaction is sent
  - reuse of the existing zkSync AA-aware `writeContract` path for preview and execution
  - optional CLI defaults through `ZKSYNC_SWAP_ROUTER_ADDRESS` and `ZKSYNC_SWAP_FEE_TIER`
  - explicit paymaster override support, so Sepolia swap preview can fall back to `--paymaster-mode none` when the saved approval-based session default is incompatible
- `withdraw` support through `packages/provider-zksync-defi`, including:
  - default bridge discovery
  - L2 -> L1 withdraw transaction preview
  - gas estimation for the withdraw path
  - opt-in L2 withdraw broadcast for locally writable sessions
  - post-broadcast L2 and batch status inspection
  - direct `withdraw-status` guidance for the later `withdraw-finalize` step once the L2 side is finalized
  - optional `withdraw-status --wait` polling so the follow-up can block until the L2 side reaches a terminal state
  - L1 finalize-parameter preview and opt-in L1 finalize broadcast for later nullifier finalization
  - structured shared-bridge router error classification, so unsupported or local-only assets fail with explicit `bridge-router` metadata instead of a raw revert blob
- structured paymaster validation errors now classify known zkSync Sepolia
  SystemContext failures and known SED Lite hook rejections during estimation /
  broadcast, and surface the key validation fields in both JSON and TTY output
- generic `Target is not allowlisted` validation failures are now reported as an
  address-allowlist policy rejection instead of over-claiming which exact hook
  implementation produced the revert
- Sepolia validation result:
  - `send-token` preview works with `--paymaster-mode none`
  - approval-based paymaster still requires explicit fee-token validation and cannot assume that any ERC-20 is usable
  - approval-based preview now succeeds with the self-deployed `18 decimals` test token
  - approval-based live broadcast now works on the validated EraVM token path
  - smart-account approval-based live broadcast is validated on `sed-lite-sa-v2` with tx hash `0x2783de9185bcd6af21822c9c0ffa35e5329e96c8137ff41598d3cd001344ce8c`
  - native L2 withdraw broadcast works from `paymaster-eoa` with tx hash `0xea192d3fda23a747328c1d63b6d2e22664fd353511faf327ba8f28c408800ba8`
  - `withdraw-status` on that tx now reaches `status = finalized` with verified batch telemetry
  - `withdraw-finalize` preview on that tx now succeeds and returns concrete finalization parameters plus a Merkle proof; only L1 finalize broadcast remains intentionally unvalidated here
- background docs in `docs/`
- execution plan in `PLANS.md`
- cross-environment handoff snapshot in `PROJECT_STATE.md`

## Current Product Focus

For the current stage, the repo already has a usable zkSync-native execution
core. The remaining work is mostly productization: making the command surface,
defaults, docs, and operator path easier to consume and validate.

The active focus is:

- keep one obvious default path for setup, wallet recovery, funding, and
  execution across CLI help, connector handoff, and follow-up commands
- raise the command surface from address-first primitives toward
  product-level, symbol/discovery-assisted operator flows
- keep one installable agent-facing surface through `skills/`
- keep one connector flow that works both for colocated `--await-local`
  approval and relay/manual approval return
- keep ecosystem verticals explicitly demand-driven:
  no Polygon-style `polymarket` or `x402-pay` parity surface is currently
  justified on zkSync without stronger repeated operator demand
- keep one workflow-first action layer simpler than the lower-level direct
  commands
- continue chain validation only where the product path still has a real gap:
  L1 withdraw finalize broadcast validation, richer bridge coverage, broader swap routing, and
  broader validated defaults

## Recommended Operator Path

For the current phase, the canonical path is:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready
# Only if the CLI reports that gas funding is still required:
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Interpretation:

1. `setup` writes local config.
2. `next` is the default decision point. Use it whenever you want the shortest
   valid next step across setup, wallet recovery, and stored workflows.
3. `wallet create --await-local` or `wallet reapprove --await-local` is the
   preferred connector path for obtaining a writable local session.
4. `wallet next` and `wallet status` are the wallet-layer detailed views when
   the question is specifically about one stored wallet.
5. `workflow auto` is the default guided execution surface when you want one
   command to inspect readiness, persist checkpoints, and continue the flow.
6. `workflow start`, `workflow status`, `workflow next`, `workflow resume`, and
   `workflow fund` cover explicit checkpoint, resume, and funding-only cases.
7. `workflow run` remains available as the lower-level one-shot path.

Use the help entrypoint that matches the current question:

- `zk-agent --help` for the top-level product path
- `zk-agent wallet --help` for wallet/session recovery
- `zk-agent workflow --help` for workflow execution and resume

For connector relay fallback, encrypted approval payloads, checkpoint lifecycle,
and the full verified command sequence, use
[skills/QUICKSTART.md](./skills/QUICKSTART.md).

For the current machine-readable operator contract across `next`, `workflow`,
and the smoke/product validation layer, use
[docs/10-operator-json-contract.md](./docs/10-operator-json-contract.md).

## User-Facing Command Model

From an operator point of view, the CLI now has one consistent shape:

```bash
zk-agent <top-level-command> [subcommand] [flags]
```

The command surface is intentionally organized around three help entrypoints,
one local identity surface, plus one lower-level escape hatch.

### 1. Product entrypoint

Use `zk-agent --help` when you want the default operator path. This is the
top-level product view:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready
```

`zk-agent next` is the default decision point. It chooses between setup,
wallet bootstrap/recovery, and workflow continuation. `workflow auto` is the
default guided action entry once the wallet is writable; if gas is still
missing, it points to `workflow fund` as the next step. The root help output
now also prioritizes `next`, `wallet`, and `workflow` before the lower-level
command families, so the product path is visible before the raw primitives.

When you want the wallet-scoped recommendation path to stay on a specific fee
mode instead of inheriting the stored wallet default, use:

```bash
zk-agent next --paymaster-mode sponsored
```

That override changes the recommended follow-up commands returned by `next`;
it does not rewrite the saved wallet record.

### 2. Wallet entrypoint

Use `zk-agent wallet --help` when the question is specifically about local
wallet state, connector approval, or stored-session recovery. This is the
wallet-layer view:

```bash
zk-agent wallet create --await-local
zk-agent wallet create --await-local --session-preset transfer-only
zk-agent wallet create --await-local --session-hours 12 --allow-contract <contract-address> --allow-transfer-to <recipient-address>
zk-agent next
zk-agent wallet reapprove --name main --await-local
zk-agent wallet reapprove --name main --session-preset full-access
zk-agent wallet reapprove --name main --disallow-contract-calls
zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait
zk-agent next
zk-agent wallet status --name main
zk-agent wallet next --name main
```

`wallet next` is the narrowed wallet-only view when you already know the issue
is inside one stored wallet record. When you need a tighter session, put the
guardrails directly on `wallet create|reapprove`: use `--session-preset` for
the common shapes (`full-access`, `transfer-only`, `contract-only`, `readonly`),
use `--session-hours` to time-box the approval, `--allow-transfer-to` and
`--allow-contract` to turn the session into an address allowlist, or
`--disallow-transfers` / `--disallow-contract-calls` to remove those
capabilities entirely.

### 3. Workflow entrypoint

Use `zk-agent workflow --help` when the user intent is already known and
you want the execution path. This is the action-layer view:

```bash
zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready
zk-agent workflow auto --wallet main --intent send-native --to <recipient-address> --amount <amount> --ensure-wallet-session --session-preset intent
zk-agent workflow auto --wallet main --intent <intent> --ensure-wallet-session --session-hours 12 --allow-contract <contract-address>
zk-agent workflow start --wallet main --intent <intent> [goal flags]
zk-agent workflow status --request-id <id>
zk-agent workflow next --request-id <id>
zk-agent workflow resume --request-id <id> [--broadcast]
zk-agent workflow fund --wallet main --amount <amount> --execute
zk-agent workflow run --wallet main --intent <intent> [goal flags]
```

Use `workflow auto` for the guided default path. Use
`workflow start/status/next/resume` for explicit checkpointed execution,
`workflow fund` when you only want to dispatch the gas-funding step, and
`workflow run` only when you explicitly want the lower-level one-shot path.
When `--ensure-wallet-session` is enabled, the same session guardrail flags from
`wallet create|reapprove` can be passed here as well, including
`--session-preset intent` when the goal should auto-derive the narrowest
default session.

### 4. Direct commands

The local identity/profile surface is separate from wallet/session state:

```bash
zk-agent agent status
zk-agent agent set --name "SED Operator" --wallet main
zk-agent agent show
zk-agent agent export
zk-agent agent import --payload @agent-profile.json --overwrite
```

Use `agent` when you need stable local operator metadata for harnesses, logs, or
profile export, but do not want to imply that the project already ships a
canonical zkSync reputation protocol.

### 5. Direct commands

The top-level action commands still exist, but they are the lower-level path:

```bash
zk-agent fund ...
zk-agent send ...
zk-agent send-token ...
zk-agent swap ...
zk-agent bridge ...
zk-agent deposit ...
zk-agent withdraw ...
```

Use these for scripting, debugging, or when you explicitly want to bypass the
workflow-oriented UX.

For local test assets under `packages/paymaster-test-assets/deployments`,
tokenized `fund`, `send-token`, `swap`, `bridge`, `deposit`, `withdraw`, and
the corresponding `workflow` intents can now resolve token address/decimals
from the stored symbol on the active chain instead of requiring a raw address
every time.

`workflow plan` now also emits symbol-first token skeletons for `send-token`
and `swap`, and points operators to `assets`, `tokens --owned`, `tokens`, and
`resolve-token` when they need to inspect the current local-first registry
before execution.

If you want broader symbol coverage without hardcoding addresses into commands,
set `ZK_AGENT_TOKEN_DIRECTORY_ROOT` to a local token-directory checkout or
export that contains `index/index.json` and chain-scoped `erc20.json` files.
Resolution stays local-first:

1. local deployment metadata in `packages/paymaster-test-assets/deployments`
2. optional token directory under `ZK_AGENT_TOKEN_DIRECTORY_ROOT`

`zk-agent defaults` now shows both the source order and the token-directory
chain coverage that the current local index exposes.

The discovery-facing commands now also emit structured `recommendedCommands`
in JSON mode and matching follow-up lines in TTY mode, so operators can move
from `assets`, `tokens`, or `resolve-token` into the next concrete discovery
step without inferring the command shape by hand.

Those same discovery results now also surface any current validated-default
registry roles attached to a token address, so the operator can see whether a
token is currently acting as the tracked SyncSwap pair token or paymaster fee
token instead of only seeing symbol/address metadata.

When one symbol is still ambiguous, `tokens` and `resolve-token` now also
accept `--role swap-token-a|swap-token-b|paymaster-fee-token`, so the operator
can stay on a symbol-first path and constrain the result to the tracked
defaults-registry role instead of falling back to manual address picking
immediately.

When you want to stay inside one discovery source, `tokens` and
`resolve-token` also accept `--source local-deployments|token-directory`, and
their follow-up commands now preserve that source filter instead of silently
dropping back to the merged local-first view.

Use `zk-agent tokens --chain zksync-sepolia` when you need to inspect the
currently discoverable local-first token set for one chain.

Use `zk-agent tokens --chain zksync-sepolia --symbol USDC` when you want
to inspect all discoverable entries for one symbol before deciding which token
address to pass explicitly.

Use `zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token`
when the symbol itself is ambiguous and you want only the entries currently
serving one tracked default role.

Use `zk-agent tokens --chain zksync-sepolia --symbol USDC --source token-directory`
when you want to inspect only token-directory-backed entries and keep that same
source context in the suggested follow-up commands.

Use `zk-agent tokens --wallet main --owned` when you want the current
stored wallet's registry-backed ERC-20 holdings on its active chain, instead
of the full discoverable registry universe. On zkSync chains, this owned-token
view now also surfaces the current shared-bridge canonical-mapping status for
each held ERC-20, so bridge blockers are visible before you try `withdraw` or
`bridge`, and it now includes a structured summary of owned-token sources,
bridge-mapping counts, and tracked defaults-registry role counts. This is the
narrower ERC-20 subset view, not the main asset entrypoint.

Use `zk-agent balances --wallet main --owned-tokens` when you want the
normal native balance view plus the same registry-backed ERC-20 holdings merged
into one single-chain balances result. Keep this for the raw balances surface
or when you may switch to `--chains`; otherwise prefer `assets`.

Use `zk-agent assets --wallet main` when you want that richer single-chain
asset view directly, without remembering the extra balances flag. This is the
preferred product-facing asset command, and it now preserves the same owned
token shared-bridge mapping annotations and owned-token discovery summary as
`tokens --wallet <name> --owned`.

Use `zk-agent resolve-token --chain zksync-sepolia --symbol USDC` when you
need to confirm how the current local-first registry resolves one exact token
query before trying `fund`, `send-token`, or `swap`.

Use `zk-agent resolve-token --chain zksync-sepolia --symbol USDC --role paymaster-fee-token`
when you want that same resolution narrowed to one tracked default role.

Use `zk-agent resolve-token --chain zksync-sepolia --symbol USDC --source token-directory`
when you want to confirm the token-directory-backed resolution path only.

If you want a local token-directory generated from this repo's own deployment
records, run:

```bash
pnpm --filter @zk-agent/paymaster-test-assets export:token-directory
```

Then point `ZK_AGENT_TOKEN_DIRECTORY_ROOT` at
`packages/paymaster-test-assets/token-directory`.

## Agent Skills

The repo now includes an agent-facing skills surface:

- [skills/SKILL.md](./skills/SKILL.md)
- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

These files are the shortest maintained entrypoint for agent harnesses that
need the current canonical CLI path without reading the entire repository.

## Development Environment Strategy

Current default:

- Primary development target: `zkSync Sepolia`
- Optional local fast-path: lightweight local node only when needed
- Deferred heavyweight environment: full local `ZK Stack` ecosystem

Why:

- Our current implementation focus is on:
  - wallet/session lifecycle
  - native AA transaction structure
  - paymaster-aware execution
  - connector approval flow
- These are better validated first against a real zkSync environment than against a freshly self-hosted local chain.
- The local docs indicate that a zkSync-specific local environment becomes much more important when testing:
  - bridging
  - cross-chain flows
  - L1 <-> L2 integration
  - Elastic Network behavior

Practical rule:

1. Use `zkSync Sepolia` as the default target while building wallet, session, AA, paymaster, and basic transaction features.
2. If we need faster local iteration for isolated testing, use a lightweight local node path rather than a full custom chain first.
3. Only stand up a full local `ZK Stack` environment once we actively implement and validate:
   - `bridge`
   - `deposit`
   - `withdraw`
   - L2 -> L2 / Elastic Network flows
   - chain-specific routing behavior

This keeps the early development loop cheaper while preserving a clear path to later `ZK Stack` support.

## Workspace

```text
zk-agent-cli/
├─ packages/
│  ├─ agent-core/
│  ├─ agent-session-protocol/
│  ├─ agent-tools/
│  ├─ provider-zksync-wallet/
│  ├─ provider-zksync-defi/
│  ├─ plugin-identity/
│  ├─ zk-agent-cli/
│  └─ zk-connector-ui/
├─ docs/
├─ AGENTS.md
├─ PLANS.md
├─ package.json
└─ pnpm-workspace.yaml
```

## Scripts

```bash
pnpm install
pnpm zk-agent --help
pnpm zksync-agent --help
pnpm tool:list
pnpm tool:run -- --tool getAssetsTool --input '{"walletName":"main"}'
pnpm tool:run -- --tool walletStatusTool --input '{"walletName":"main"}'
pnpm tool:run -- --tool workflowAutoTool --input '{"walletName":"main","intent":"send-native","goal":{"intent":"send-native","to":"0x1111111111111111111111111111111111111111","amount":"0.001"},"createCheckpoint":true}'
pnpm tool:run -- --tool walletReapproveTool --input '{"walletName":"main","policyPreset":"full-access"}'
pnpm tool:run -- --tool workflowOrchestratorTool --input '{"walletName":"main","intent":"send-native","goal":{"intent":"send-native","to":"0x1111111111111111111111111111111111111111","amount":"0.001"},"ensureWalletSession":true,"approvalPolicyPreset":"intent","createCheckpoint":true}'
pnpm smoke:discovery -- --wallet <name> [--symbol <symbol>]
pnpm smoke:flagship-workflow -- --wallet <name> [--paymaster-mode approval-based|sponsored]
pnpm smoke:operator-path -- --wallet <name> [--paymaster-mode none|approval-based|sponsored]
pnpm smoke:product-path -- --wallet <name> [--tx-hash <withdrawTxHash>] [--paymaster-mode approval-based|sponsored] [--execute-swap]
pnpm smoke:product-path -- --wallet <name> [--tx-hash <withdrawTxHash>] [--paymaster-mode approval-based|sponsored] --execute-all
pnpm smoke:paymaster-success -- --wallet <name>
pnpm smoke:swap-success -- --wallet <name>
pnpm release:check
pnpm validate:release
pnpm validate:phase3
pnpm validate:phase4a
pnpm typecheck
pnpm test
pnpm build
```

`pnpm validate:phase4a` is kept as a legacy alias for
`pnpm validate:release` while older notes are being retired.

Recommended root wrappers for the current stable product surface:

- `pnpm tool:list` and `pnpm tool:run -- --tool <toolName> --input <json|@file>`
  expose the agent-tools registry without repeating package-filter boilerplate
  and now return the closest `cliCommand` equivalent plus `exampleInput` for
  the main operator-path tools
- wallet/session recovery tools now accept the same preset-style guardrails as
  the CLI:
  `walletReapproveTool.policyPreset = full-access|transfer-only|contract-only|readonly`,
  and `workflowOrchestratorTool.approvalPolicyPreset = ... | intent`
- key tools on the default operator path also expose `operatorPathStage`, so an
  agent can distinguish routing, session acquisition, guided execution,
  funding fallback, and checkpoint follow-up without maintaining its own map
- `pnpm tool:list` now also returns a top-level `recommendedSequence`, so an
  agent can consume the default product path directly instead of reconstructing
  stage order from individual tool rows
- `pnpm smoke:discovery -- --wallet <name> [--symbol <symbol>]` validates the
  product-layer discovery/default inspection path through the real CLI JSON
  surface:
  `defaults`, `assets`, `balances --owned-tokens`, `tokens --owned`,
  `tokens --chain`, and `resolve-token`
- `pnpm smoke:flagship-workflow -- --wallet <name> [--relay-url <url>] [--paymaster-mode approval-based|sponsored] [--execute]`
  validates the current Phase 5 flagship AA operator story in one narrower
  sequence: with `--relay-url` it first validates the external hosted relay,
  then runs relay-backed wallet reapproval on the existing wallet, then the
  paymaster-backed workflow-auto send-native path on that same wallet; it is
  the productized AA signature path, not a broad DeFi breadth harness
- `pnpm smoke:operator-path -- --wallet <name> [--paymaster-mode none|approval-based|sponsored]` validates the canonical
  `next -> wallet -> workflow auto -> funding fallback or goal preview` path
  and now accepts an optional `--paymaster-mode` override so the operator-path
  guidance can be previewed against a specific fee path instead of always
  inheriting the stored wallet default, and returns structured follow-up fields
  in `summary`, including
  `topLevelRecommendedCommands`, `workflowRecommendedCommands`,
  `topLevelAgentFollowup`, and `workflowAgentFollowup`
- `pnpm smoke:product-path -- --wallet <name> [--tx-hash <withdrawTxHash>] [--paymaster-mode approval-based|sponsored] [--execute-swap]`
  aggregates the current product-level live validation sequence:
  canonical operator path, validated paymaster-backed workflow-auto path,
  validated default workflow-auto swap path, and optional withdraw follow-up
  when a previous withdraw tx hash is supplied, with per-step `followups`
  alongside the legacy flat `nextCommands` summary; those `followups` now also
  preserve per-step `phase`, `stage`, `goalMode`, and `txHash` when available;
  `--paymaster-mode sponsored` lets the same product-path harness exercise the
  smart-account sponsored path instead of the approval-based default
- `pnpm smoke:product-path -- --wallet <name> [--tx-hash <withdrawTxHash>] [--paymaster-mode approval-based|sponsored] --execute-all`
  is the convenience form for future controlled broadcast/finalize runs: it
  turns on paymaster execute, swap execute, and withdraw finalize execute
  together instead of repeating all three flags manually
- `pnpm smoke:paymaster-success -- --wallet <name> [--execute]` validates the
  tracked approval-based Sepolia paymaster path, including the mode-only
  fallback to the tracked validated paymaster address and EraVM fee token,
  and now exposes the workflow-layer `recommendedCommands` plus
  structured `agentFollowup` / registry metadata in its normalized payload
- `pnpm smoke:swap-success -- --wallet <name> [--amount-in <amount>] [--amount-out-min <amount>] [--paymaster-mode <mode>] [--execute]`
  validates the tracked default Sepolia swap path through `workflow auto`,
  resolves the current default router / factory / tracked token pair from the
  registry, defaults to `--paymaster-mode none` so swap-path validation is not
  blocked by an incompatible wallet paymaster, and returns the quoted output
  plus workflow-layer `recommendedCommands` plus `agentFollowup` in one
  normalized payload
- the tracked Sepolia `no-paymaster` path is now promoted into the validated
  defaults surface as the current `--paymaster-mode none` default for both EOA
  and smart-account
- `pnpm smoke:remote-approval -- --wallet <name> [--chain <chain>] [--relay-url <url>]`
  validates the relay-backed create -> publish -> pending -> ready -> approve
  -> import lifecycle through the real CLI JSON surface, using a local relay
  automatically when `--relay-url` is omitted
- `pnpm validate:phase3` runs the current Phase 3 regression set across
  `agent-core`, `agent-tools`, and `zk-agent-cli`, including the remote
  approval smoke runtime regression

Test ERC-20 utility:

```bash
pnpm --filter @zk-agent/paymaster-test-assets compile
pnpm --filter @zk-agent/paymaster-test-assets deploy
pnpm --filter @zk-agent/paymaster-test-assets compile:eravm
pnpm --filter @zk-agent/paymaster-test-assets deploy:token:eravm
pnpm --filter @zk-agent/paymaster-test-assets deploy:paymaster
```

## Test ERC-20 Package

`packages/paymaster-test-assets` is a small workspace package that gives us deterministic
Sepolia assets for paymaster testing, so we do not need to depend on third-party
token or paymaster addresses.

What it does:

- compiles `contracts/StandardTestToken.sol` with standard `solc`
- writes the artifact to `packages/paymaster-test-assets/artifacts/StandardTestToken.json`
- deploys the token to zkSync Sepolia through standard EVM bytecode deployment
- records the latest deployment in `packages/paymaster-test-assets/deployments/zksync-sepolia.latest.json`
- can also export and deploy the same token as native EraVM bytecode for
  approval-based compatibility testing
- compiles and deploys the EraVM-native `ManagedPaymaster`

Why it uses this route:

- the package exists to produce deterministic paymaster test assets
- zkSync's EVM Interpreter is still useful as a cheap baseline for standard
  ERC-20 deployment
- but Sepolia validation showed that approval-based live broadcast can depend on
  whether the fee token itself is deployed as native EraVM bytecode

Configuration lives in the root `.env` file. A safe template is provided in `.env.example`.

Relevant fields:

- `ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY`
- `ZKSYNC_SEPOLIA_WALLET_ADDRESS`
- `ZKSYNC_SEPOLIA_RPC_URL`
- `ZKSYNC_SWAP_ROUTER_ADDRESS`
- `ZKSYNC_SWAP_FEE_TIER`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_NAME`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SYMBOL`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_DECIMALS`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SUPPLY`

## Environment and Config Notes

- zkSync Sepolia reads now honor `ZKSYNC_SEPOLIA_RPC_URL` everywhere the built-in
  chain definition is resolved, not only in package-specific deploy scripts.
- In the Codex sandbox used for this repository, public RPC hostname resolution
  is not reliable. If `sepolia.era.zksync.dev` or other RPC hosts fail inside
  the sandbox, retry from the host shell or an approved unsandboxed command
  before concluding that the endpoint is unavailable.
- `deploy` sends a real transaction to `zkSync Sepolia`.
- The configured wallet address must match the configured private key.
- The default template uses `18` decimals because raw token units matter for
  approval-based paymaster testing.
- `artifacts/` and `deployments/` are intentionally git-ignored.

## Paymaster Validation Summary

Key distinction:

- a token can work as a normal ERC-20 transfer target
- that same token can still fail as an approval-based paymaster fee token

Current guidance:

- use `--paymaster-mode none` to validate the base transaction path first
- if `swap` fails during approval-based estimation, rerun it with
  `--paymaster-mode none` to separate swap-path issues from paymaster/fee-token
  issues
- only use `approval-based` with tokens that have been explicitly validated for
  the active paymaster path

Current local Sepolia result:

- a self-deployed EraVM `ManagedPaymaster` plus an EVM-interpreter ERC-20 makes
  approval-based preview / estimation succeed
- that same EVM-interpreter fee-token path is still rejected on live broadcast
  with a `SystemContext`-related validation failure
- once the fee token itself is also deployed as native EraVM bytecode,
  approval-based live broadcast succeeds
- locally deployed zkSync test ERC-20s work for same-chain transfer and swap
  testing, but L2 -> L1 `withdraw` / `bridge` preview still fails with
  `WITHDRAW_ESTIMATION_BRIDGE_ROUTER_REJECTED` and `validation.kind =
  asset-id-mismatch` because those assets do not have the canonical shared-bridge
  L1 mapping required by the current route

Practical conclusion:

- custom paymaster live broadcast works
- approval-based live broadcast works on the validated EraVM token path
- fee-token implementation details materially affect live validation

## Smart-Account Validation Summary

Current CLI surface:

- `wallet status` surfaces undeployed records, signer mismatches, and
  fully write-ready wallets
- `wallet smart-account predict|deploy` supports built-in profiles such as
  `sed-lite` and `daily-spend-limit`
- `wallet smart-account deploy` saves the deployed address locally and now
  returns `wallet status` / `wallet next` follow-ups

Current base profile:

- `sed-lite` is the main AA base profile in this repository
- it preserves the current CLI/provider ECDSA flow while moving signature
  checks behind a dedicated K1 validator
- it splits account internals into lighter Auth/Manager layers and keeps a
  modular owner/self/module shape derived from Clave
- it already supports owner rotation, module toggling, native per-tx caps, and
  a minimal external validation-hook pipeline

Validated hook contracts on Sepolia:

- `NativePerTxLimitHook`
- `TargetAllowlistHook` at `0x7d397543D22a01e38e73c1029af7EbdF6F8D13BD`
- `TargetSelectorAllowlistHook` at `0x06FBe4ddda312311694DB81f9471b20E66101dEe`

Validated `sed-lite` behavior on Sepolia:

- `predict` and `deploy` work
- owner and cap reads work
- plain native transfer works after funding the account
- native per-transaction cap writes work
- over-cap native transfers are rejected during validation
- below-cap native transfers still succeed

Validated hook-layer behavior on Sepolia:

- `NativePerTxLimitHook` deploys as a standalone EraVM contract
- a fresh `sed-lite` deployment can enable hooks and read back per-account hook
  state onchain
- with the native-cap hook enabled, below-cap transfers succeed and over-cap
  transfers are rejected during validation
- the same native-cap hook also works on the approval-based paymaster path:
  below-cap transactions succeed with fee-token payment, while over-cap
  transactions are rejected during paymaster fee estimation with the same
  hook-specific reason
- `TargetAllowlistHook` allows allowlisted recipients and rejects
  non-allowlisted recipients with `Target is not allowlisted`
- `TargetSelectorAllowlistHook` allows configured `(target, selector)` pairs and
  rejects non-allowlisted selectors with `Target selector is not allowlisted`

Current limitations and cautions:

- `wallet smart-account daily-spend-limit show|set|remove` drives the built-in
  profile state through the existing call/write pipeline, but native-transfer
  enforcement for `daily-spend-limit` still needs more EraVM-specific work
- execution-time checks on that profile do not currently catch plain native
  sends, while validation-time checks hit the documented `SystemContext`
  restriction because the policy uses `block.timestamp`
- built-in profiles still require a zkSync-compatible EraVM account artifact
  before they can actually deploy; standard EVM `solc` artifacts are not enough
- the generic deploy / reconstruct / restore lifecycle is still not finished
- older `sed-lite` deployments that predate hook support need a fresh redeploy
  to expose the new hook methods
- write commands now fail early for undeployed smart-account records instead of
  returning misleading previews
- current Sepolia broadcast results should not be treated as proof that the
  long-term smart-account design is finished

## Notes

- Verified local defaults in this repository currently include:
  - `zkSync Era` chain ID `324`
  - `zkSync Sepolia` chain ID `300`
  - mainnet RPC `https://mainnet.era.zksync.io/`
  - sepolia RPC `https://sepolia.era.zksync.dev`
- Other Elastic Network chains should be added through explicit registry entries instead of hardcoded guesses.

## License

MIT. See `LICENSE`.
