# zk-agent-cli

`zk-agent-cli` is a local-first monorepo for building an agent-oriented CLI on top of `zkSync Era` and the wider `ZK Stack`.

Current handoff snapshot:

- [PROJECT_STATE.md](./PROJECT_STATE.md)

Agent-facing entrypoint:

- [skills/SKILL.md](./skills/SKILL.md)
- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

The project is intentionally modeled after the real architecture of `polygon-agent-cli`, but it is not a direct fork. The goal is to preserve the reusable system shape:

- CLI entrypoint for humans and agent harnesses
- browser connector UI for session approval
- shared protocol package for session payloads, relay messages, and crypto
- core package for storage, chain registry, and provider interfaces
- provider packages for zkSync-specific wallet and DeFi capabilities
- agent tool adapters for LLM / framework integration

## Current Phase

The project has moved past scaffolding and isolated chain experiments.

Current stage: `Phase 3: productization and parity`.

What that means:

- the zkSync-native engineering baseline already exists
- the main remaining gap versus `polygon-agent-cli` is product packaging, not
  raw chain mechanics
- the next work should optimize for agent/operator usability before broadening
  the AA surface further

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
- `zksync-ethers` read path for balances and contract calls
- `balances` now supports:
  - stored-wallet default chain reads
  - single-chain override
  - multi-chain aggregation across the built-in zkSync chain registry
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
- `wallet next` for the shortest next-step CLI guidance, combining status, sync/deploy/reapprove hints, and funding detection into one operator-facing summary
- `workflow plan` for higher-level action sequencing, so one command can spell out the prerequisite and execution steps for `send`, `swap`, `bridge`, `deposit`, and `withdraw`
- `workflow fund` as a workflow-first alias for the default funding step, so the canonical operator path no longer has to jump back out to the top-level `fund` command family
- `workflow start` for persisting a local workflow checkpoint keyed by `requestId`, so longer-running flows can resume without re-entering the full goal payload
- `workflow run` for bounded orchestration: it can auto-sync local metadata, dispatch a separate funding step when gas is missing, and only executes the goal action once the wallet is actually ready
- `workflow next` for the shortest next-step CLI guidance at the workflow layer, from either fresh goal input or a stored checkpoint
- intent-specific workflow shortcuts such as `workflow send-native`, `workflow swap`, and `workflow bridge`, so the common execution path no longer has to repeat `run --intent ...`
- `workflow status|run|resume --ensure-wallet-session [--await-local] [--relay-url <url>]` for connector-backed recovery when a workflow is blocked only because the local writable session is missing or stale, now with local callback, manual payload-return, and one-step relay publish plus relay status/approve guidance
- workflow checkpoint and JSON command outputs now distinguish the long-lived `workflowRequestId` from any temporary connector `walletRequestId`
- `workflow` write intents now also preserve explicit paymaster overrides for the supported send / call / swap goal types, so checkpointed execution can replay the same fee-payment mode later
- `workflow` and `wallet next` now treat supported paymaster-backed smart-account writes as gas-satisfied even when the stored native balance is zero, so `send` / `send-token` / `call` / `swap` do not get blocked behind an unnecessary fund step before paymaster validation is attempted
- on `zksync-sepolia`, approval-based paymaster mode can now fall back to the tracked validated paymaster + EraVM fee-token defaults when the wallet or workflow only specifies the mode and omits the explicit address/token
- `workflow status|next|resume` for checking whether a previously prepared workflow is still blocked, still waiting on funding, or ready to continue, with optional `--request-id` loading from the stored checkpoint
- `workflow list|show|update|delete` for local checkpoint inspection, runtime-setting adjustments, and cleanup, so longer-running operator flows do not accumulate opaque local state
- `wallet sync` for refreshing local smart-account metadata from deployed onchain state, including saved built-in profile context such as `sed-lite`
- `wallet export|restore` for portable local wallet backups and recovery across machines, with optional post-restore resync against deployed onchain state
- `wallet reapprove --await-local` for reacquiring a writable local session after restore without dropping recovered smart-account metadata
- local connector approval loop support via:
  - `wallet create --await-local`
  - `wallet create --relay-url <url>` / `wallet reapprove --relay-url <url>` for one-step remote approval publishing
  - auto-consume of approved local requests
  - `wallet request await-local`
  - `wallet request approve --payload ...` for non-colocated/manual connector return
  - `relay serve` + `wallet create|reapprove --relay-url <url>` + `wallet request relay-status|approve` for the local file-backed hosted relay prototype
  - relay-backed connector pages now show share/status URLs, auto-refresh pending approval state, and reflect encrypted submission immediately
  - `wallet request list` with expired-request pruning
  - connector callback handoff back into the waiting CLI process
- first agent-facing tool surface in `packages/agent-tools` for:
  - funding guidance, including route-aware suggested commands
  - top-level next-step guidance across setup, wallet readiness, and stored workflow checkpoints
  - workflow-first funding execution that reuses the validated deposit / bridge path when execution is requested
  - intent-specific workflow wrappers for `send-native`, `send-token`, `call-write`, `swap`, `bridge`, `deposit`, and `withdraw`
  - bounded workflow execution for concrete write intents
  - workflow status inspection for resume-safe orchestration
  - workflow next-step guidance from fresh goal input or a stored checkpoint
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
  - bounded workflow execution with separate funding-step dispatch
  - local workflow checkpoint lifecycle management for start/list/get/update/delete
  - workflow status / next-step guidance / execution directly from stored checkpoint `requestId`
  - wallet sync
  - wallet export
  - wallet restore
  - balances
  - defaults / registry readout for supported, validated, experimental, and manual paths
  - contract read
  - same-chain swap preview / broadcast for explicit-router Uniswap V3 exactInputSingle paths
  - bridge preview / broadcast / status for the supported Sepolia L1 <-> zkSync route
  - deposit preview / broadcast / status
  - native send
  - token send
  - withdraw preview / broadcast / status / finalize preview / finalize broadcast
  - contract write
  - smart-account plan/deploy wrappers
  - default `createZkSyncAgentTools()` / `createZkSyncAgentToolContext()` factories
  - `pnpm --filter @zk-agent/agent-tools tool:run -- --list`
  - `pnpm --filter @zk-agent/agent-tools tool:run -- --tool <toolName> --input <json|@file>`
  - `pnpm --filter @zk-agent/agent-tools smoke:readonly -- --wallet <name> [--call-to <address> --call-data <hex>]` for real provider read-only smoke
  - `pnpm --filter @zk-agent/agent-tools smoke:operator-path -- --wallet <name> [--to <address>] [--amount <native>]` for preview-only validation of the canonical `next -> wallet -> workflow fund -> workflow run` operator path on one stored wallet
  - `pnpm --filter @zk-agent/agent-tools smoke:lifecycle -- --wallet <name>` for export -> restore -> reapprove -> write-ready recovery smoke
  - `pnpm --filter @zk-agent/agent-tools smoke:policy -- --wallet <name>` for live preview validation of SED policy rejections and normalized tool-error remediation hints
  - `pnpm --filter @zk-agent/agent-tools smoke:paymaster-success -- --wallet <name> [--execute]` for the validated EraVM approval-based workflow-backed send-native preview / broadcast path, now defaulting to mode-only paymaster input so the tracked validated fallback address/token are exercised directly
  - `pnpm --filter @zk-agent/agent-tools smoke:withdraw-followup -- --wallet <name> --tx-hash <hash> [--execute]` for withdraw-status -> finalize-preview / finalize-broadcast follow-up on a previously broadcast L2 withdraw
  - `pnpm --filter @zk-agent/agent-tools smoke:broadcast -- --wallet <name> --execute` for the opt-in live legacy fee-token incompatibility smoke, which may now fail during estimation or broadcast depending on current Sepolia behavior
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
  - unified `bridge-status` inspection on top of the deposit / withdraw lifecycle trackers
  - preserved lifecycle-specific next-step guidance in `bridge-status`, including deposit polling and withdraw finalization follow-up
- `swap` support through `packages/provider-zksync-defi`, including:
  - same-chain `Uniswap V3 exactInputSingle` and `SyncSwap classic` single-pool request shaping
  - explicit router / token / protocol input instead of hidden quote aggregation
  - tracked SyncSwap classic router / factory defaults, so the CLI can fill Sepolia-safe values when `--protocol syncswap-classic` is selected and the operator omits those flags
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
  - immediate withdraw follow-up reaches `included`, but L1 finalize preview can still fail with `WITHDRAW_FINALIZE_PREVIEW_FAILED` and cause `Log proof not found!` before the chain exposes the required log proof
- background docs in `docs/`
- execution plan in `PLANS.md`
- cross-environment handoff snapshot in `PROJECT_STATE.md`

## Current Product Focus

For the current stage, the remaining product gap versus `polygon-agent-cli` is
now mostly validation breadth, registry/default coverage, and packaging polish,
not raw chain mechanics or the absence of a usable operator path.

The active focus is:

- keep one obvious default path for setup, wallet recovery, funding, and
  execution across CLI help, connector handoff, and follow-up commands
- keep one installable agent-facing surface through `skills/`
- keep one connector flow that works both for colocated `--await-local`
  approval and relay/manual approval return
- keep one workflow-first action layer simpler than the lower-level direct
  commands
- continue chain validation only where the product path still has a real gap:
  withdraw finalization, richer bridge coverage, broader swap routing, and
  broader validated defaults

## Recommended Operator Path

For the current phase, the canonical path is:

```bash
pnpm zk-agent setup
pnpm zk-agent next
pnpm zk-agent wallet create --await-local
pnpm zk-agent next
pnpm zk-agent workflow fund --wallet main --amount <amount> --execute
pnpm zk-agent workflow run --wallet main --intent <intent> [goal flags]
```

Interpretation:

1. `setup` writes local config.
2. `next` is the default decision point. Use it whenever you want the shortest
   valid next step across setup, wallet recovery, and stored workflows.
3. `wallet create --await-local` or `wallet reapprove --await-local` is the
   preferred connector path for obtaining a writable local session.
4. `wallet next` and `wallet status` are the wallet-layer detailed views when
   the question is specifically about one stored wallet.
5. `workflow fund`, `workflow run`, `workflow start`, `workflow next`, and
   `workflow resume` are the default execution surface for actual intents.

Use the help entrypoint that matches the current question:

- `pnpm zk-agent --help` for the top-level product path
- `pnpm zk-agent wallet --help` for wallet/session recovery
- `pnpm zk-agent workflow --help` for workflow execution and resume

For connector relay fallback, encrypted approval payloads, checkpoint lifecycle,
and the full verified command sequence, use
[skills/QUICKSTART.md](./skills/QUICKSTART.md).

## User-Facing Command Model

From an operator point of view, the CLI now has one consistent shape:

```bash
pnpm zk-agent <top-level-command> [subcommand] [flags]
```

The command surface is intentionally organized around three help entrypoints
plus one lower-level escape hatch.

### 1. Product entrypoint

Use `pnpm zk-agent --help` when you want the default operator path. This is the
top-level product view:

```bash
pnpm zk-agent setup
pnpm zk-agent next
pnpm zk-agent wallet create --await-local
pnpm zk-agent next
pnpm zk-agent workflow run --wallet main --intent <intent> [goal flags]
```

`zk-agent next` is the default decision point. It chooses between setup,
wallet bootstrap/recovery, and workflow continuation.

### 2. Wallet entrypoint

Use `pnpm zk-agent wallet --help` when the question is specifically about local
wallet state, connector approval, or stored-session recovery. This is the
wallet-layer view:

```bash
pnpm zk-agent wallet create --await-local
pnpm zk-agent next
pnpm zk-agent wallet reapprove --name main --await-local
pnpm zk-agent next
pnpm zk-agent wallet status --name main
pnpm zk-agent wallet next --name main
```

`wallet next` is the narrowed wallet-only view when you already know the issue
is inside one stored wallet record.

### 3. Workflow entrypoint

Use `pnpm zk-agent workflow --help` when the user intent is already known and
you want the execution path. This is the action-layer view:

```bash
pnpm zk-agent workflow run --wallet main --intent <intent> [goal flags]
pnpm zk-agent workflow start --wallet main --intent <intent> [goal flags]
pnpm zk-agent workflow next --request-id <id>
pnpm zk-agent workflow resume --request-id <id> [--broadcast]
pnpm zk-agent workflow fund --wallet main --amount <amount> --execute
```

Use `workflow run` for one-shot execution, `workflow start/next/resume` for
checkpointed execution, and `workflow fund` when you only want to dispatch the
gas-funding step.

### 4. Direct commands

The top-level action commands still exist, but they are the lower-level path:

```bash
pnpm zk-agent fund ...
pnpm zk-agent send ...
pnpm zk-agent send-token ...
pnpm zk-agent swap ...
pnpm zk-agent bridge ...
pnpm zk-agent deposit ...
pnpm zk-agent withdraw ...
```

Use these for scripting, debugging, or when you explicitly want to bypass the
workflow-oriented UX.

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
pnpm typecheck
pnpm test
pnpm build
```

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
