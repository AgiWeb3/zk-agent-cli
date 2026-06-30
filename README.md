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
- `defaults` for a machine-readable view of the built-in chains and the currently tracked validated zkSync Sepolia router / paymaster / fee-token defaults
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
- `wallet next` for the shortest next-step CLI guidance, combining status, sync/deploy/reapprove hints, and funding detection into one operator-facing summary
- `workflow plan` for higher-level action sequencing, so one command can spell out the prerequisite and execution steps for `send`, `swap`, `bridge`, `deposit`, and `withdraw`
- `workflow start` for persisting a local workflow checkpoint keyed by `requestId`, so longer-running flows can resume without re-entering the full goal payload
- `workflow run` for bounded orchestration: it can auto-sync local metadata, dispatch a separate funding step when gas is missing, and only executes the goal action once the wallet is actually ready
- intent-specific workflow shortcuts such as `workflow send-native`, `workflow swap`, and `workflow bridge`, so the common execution path no longer has to repeat `run --intent ...`
- `workflow status|run|resume --ensure-wallet-session [--await-local] [--relay-url <url>]` for connector-backed recovery when a workflow is blocked only because the local writable session is missing or stale, now with local callback, manual payload-return, and one-step relay publish plus relay status/approve guidance
- workflow checkpoint and JSON command outputs now distinguish the long-lived `workflowRequestId` from any temporary connector `walletRequestId`
- `workflow` write intents now also preserve explicit paymaster overrides for the supported send / call / swap goal types, so checkpointed execution can replay the same fee-payment mode later
- `workflow` and `wallet next` now treat supported paymaster-backed smart-account writes as gas-satisfied even when the stored native balance is zero, so `send` / `send-token` / `call` / `swap` do not get blocked behind an unnecessary fund step before paymaster validation is attempted
- `workflow status|resume` for checking whether a previously prepared workflow is still blocked, still waiting on funding, or ready to continue, with optional `--request-id` loading from the stored checkpoint
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
  - bounded workflow execution for concrete write intents
  - workflow status inspection for resume-safe orchestration
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
  - workflow status / execution directly from stored checkpoint `requestId`
  - wallet sync
  - wallet export
  - wallet restore
  - balances
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
  - `pnpm --filter @zk-agent/agent-tools smoke:lifecycle -- --wallet <name>` for export -> restore -> reapprove -> write-ready recovery smoke
  - `pnpm --filter @zk-agent/agent-tools smoke:policy -- --wallet <name>` for live preview validation of SED policy rejections and normalized tool-error remediation hints
  - `pnpm --filter @zk-agent/agent-tools smoke:paymaster-success -- --wallet <name> [--execute]` for the validated EraVM approval-based workflow-backed send-native preview / broadcast path
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

What is next:

1. standardize the default operator path around:
   `setup -> wallet create/reapprove -> fund -> workflow run`
2. add an installable `skills/` surface so agent harnesses do not need repo-
   specific tribal knowledge
3. upgrade the connector from the current local callback + encrypted relay
   package prototype to a hosted relay-capable remote approval flow
4. wrap the current action surface in stronger workflow-oriented adapters with
   clearer defaults and guardrails
5. continue focused chain validation where the product path still has a real
   gap:
   - withdraw finalization follow-up through proof availability
   - deposit lifecycle follow-up beyond status
   - broader bridge coverage
   - richer swap routing and quote resolution

Compared with `polygon-agent-cli`, the practical parity target for the next
stage is:

- one obvious default path for wallet bootstrap and transaction execution
- one installable agent-facing surface
- one connector flow that works both for colocated `--await-local` approval and for manual or encrypted relay payload return
- one opinionated workflow layer on top of the current zkSync action surface

## Recommended Operator Path

For the current phase, treat this as the canonical CLI path:

1. Initialize local defaults:

```bash
pnpm zk-agent setup
```

2. Create or refresh a writable local wallet session through the connector:

```bash
pnpm zk-agent wallet create --await-local
```

If the wallet already exists but has lost its writable local session:

```bash
pnpm zk-agent wallet reapprove --name main --await-local
```

If the connector cannot call back into the waiting CLI process, the manual
fallback is:

1. Start the relay prototype:

```bash
pnpm zk-agent relay serve
```

2. Run `wallet create` or `wallet reapprove` with `--relay-url <url>`:

```bash
pnpm zk-agent wallet create --relay-url <relay-url>
pnpm zk-agent wallet reapprove --name main --relay-url <relay-url>
```

3. Open the returned share URL in the connector UI.
4. Finalize directly from the CLI once the connector operator has the approval code:

```bash
pnpm zk-agent wallet request approve --request-id <id> --relay-url <relay-url> --code <code> --wait
```

If you only want to inspect readiness first:

```bash
pnpm zk-agent wallet request relay-status --request-id <id> --relay-url <relay-url> --wait
```

5. Finalize it from the CLI with either:

```bash
pnpm zk-agent wallet request approve --request-id <id> --payload @approved-session.json
```

Or, for the encrypted relay package path:

```bash
pnpm zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>
```

3. Ask the CLI for the shortest next remediation or execution step:

```bash
pnpm zk-agent wallet next --name main
```

If you need the same recommendation plus the underlying inspection details:

```bash
pnpm zk-agent wallet status --name main
```

4. If native gas is missing, dispatch the suggested funding route:

```bash
pnpm zk-agent fund --wallet main --amount <amount> --execute
```

5. Execute the actual goal through the workflow surface. Omit `--broadcast` to preview first:

```bash
pnpm zk-agent workflow run --wallet main --intent send-native --to <address> --amount <amount> --broadcast
```

If a workflow is blocked on reapproval and the connector cannot call back into
the waiting CLI process, use `--ensure-wallet-session --relay-url <relay-url>`
to make `workflow run|status|resume` auto-publish the approval request to the
relay and emit relay status/approve follow-up commands instead of only local
callback guidance.

The key rule is: do not jump straight from wallet creation into ad-hoc write
commands. Let `wallet next` and `workflow run` carry the default operator path.

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

Behavior note:

- CLI/provider zkSync Sepolia reads now honor `ZKSYNC_SEPOLIA_RPC_URL` everywhere the built-in chain definition is resolved, not only in package-specific deploy scripts.
- In the Codex sandbox used for this repository, public RPC hostname resolution is not reliable. If `sepolia.era.zksync.dev` or other RPC hosts fail from inside the sandbox, do not assume the endpoint is down until the same request is retried from the host shell or an approved unsandboxed command.

Important:

- `deploy` sends a real transaction to `zkSync Sepolia`
- the configured wallet address must match the configured private key
- the default template uses `18` decimals because raw token units matter for approval-based paymaster testing
- `artifacts/` and `deployments/` are intentionally git-ignored

## Paymaster Testing Note

Current Sepolia testing in this repository showed an important distinction:

- a token can work as a normal ERC-20 transfer target
- that same token can still fail as an approval-based paymaster fee token

So for `approval-based` testing, do not assume "standard ERC-20" automatically means "valid paymaster fee token".

For now:

- use `--paymaster-mode none` to validate the base transaction path
- if `swap` fails during approval-based paymaster estimation on Sepolia, re-run it with `--paymaster-mode none` first to separate swap-path issues from fee-token / paymaster-path issues
- only use `approval-based` with tokens that have been explicitly validated for the active paymaster path

Latest local result:

- a self-deployed EraVM `ManagedPaymaster` plus an EVM-interpreter ERC-20 can
  make approval-based preview / estimation succeed
- that same EVM-interpreter fee-token path is still rejected on live broadcast
  with a `SystemContext`-related validation failure
- once the fee token itself is also deployed as native EraVM bytecode,
  approval-based live broadcast succeeds
- locally deployed zkSync test ERC-20s can be used for same-chain transfer and
  swap testing, but L2 -> L1 `withdraw` / `bridge` preview currently fails with
  `WITHDRAW_ESTIMATION_BRIDGE_ROUTER_REJECTED` and `validation.kind =
  asset-id-mismatch`, because those assets do not have the canonical shared-bridge
  L1 mapping required by the current route
- the practical conclusion is:
  - custom paymaster live broadcast works
  - approval-based live broadcast works on the validated EraVM token path
  - fee-token implementation details matter for live validation

Important:

- `wallet status` now surfaces when a record is still undeployed or has signer metadata mismatches
- `wallet status` now also shows when a record is fully write-ready after deployment
- `wallet smart-account predict|deploy` now exists, and it can now resolve built-in profiles such as `sed-lite` and `daily-spend-limit`
- `sed-lite` is now the better general-purpose AA base profile in this repository:
  - it keeps the current raw ECDSA signing compatibility of the CLI/provider
    while moving signature checks behind a dedicated K1 validator contract
  - it now also splits account internals into lightweight Auth/Manager layers,
    so future AA upgrades do not need to keep expanding one monolithic account contract
  - it takes the modular owner/self/module shape from Clave instead of hardcoding policy into the account core
  - it can already rotate owner, toggle modules, and manage a native per-transaction cap through self-calls
  - it now also has a minimal validation-hook pipeline for externalized policy contracts
  - `NativePerTxLimitHook` is live-validated on Sepolia
  - `TargetAllowlistHook` is now deployed on Sepolia at `0x7d397543D22a01e38e73c1029af7EbdF6F8D13BD`, and is now live-validated
  - `TargetSelectorAllowlistHook` is now deployed on Sepolia at `0x06FBe4ddda312311694DB81f9471b20E66101dEe`, and is now live-validated on the base no-paymaster path
- live Sepolia validation is now complete for the base `sed-lite` path:
  - `predict` works
  - `deploy` works
  - owner and cap reads work
  - plain native transfer works after funding the account
  - setting a native per-transaction cap works
  - an over-cap native transfer is rejected during account validation
  - a below-cap native transfer still succeeds
- live Sepolia validation now also covers the next AA layer on top of `sed-lite`:
  - `NativePerTxLimitHook` now deploys as a standalone EraVM contract
  - a fresh `sed-lite` deployment can list enabled hooks onchain
  - the hook can be enabled through a smart-account self-call
  - the hook's per-account cap state can be read back onchain
  - an over-cap native transfer is rejected during validation with the hook-specific error
  - a below-cap native transfer still succeeds with the hook enabled
  - the same hook also works with the approval-based paymaster path:
    - a below-cap transaction succeeds with fee-token payment
    - an over-cap transaction is rejected during paymaster fee estimation with the same hook-specific reason
  - `TargetAllowlistHook` is now also live-validated on Sepolia:
    - the hook can be enabled through a smart-account self-call when the account pays ETH directly
    - the allowlisted target set can be read back onchain
    - a transfer to an allowlisted recipient succeeds
    - a transfer to a non-allowlisted recipient is rejected during account validation with `Target is not allowlisted`
  - `TargetSelectorAllowlistHook` is now also live-validated on Sepolia:
    - the hook can be enabled through a smart-account self-call when the account pays ETH directly
    - the configured `(target, selector)` rule can be read back onchain
    - an allowlisted selector call succeeds, validated with ERC-20 `approve(address,uint256)`
    - a non-allowlisted selector call to the same target is rejected during account validation with `Target selector is not allowlisted`
- `wallet smart-account daily-spend-limit show|set|remove` now drives the
  built-in profile's native spend-limit state through the existing call/write
  pipeline
- live Sepolia validation still shows that native-transfer enforcement for the
  built-in `daily-spend-limit` profile needs more EraVM-specific work:
  execution-time checks do not currently catch plain native sends, while
  validation-time checks immediately hit the documented `SystemContext`
  restriction because the policy uses `block.timestamp`
- built-in profiles still require a zkSync-compatible EraVM account artifact before they can actually deploy
- standard EVM `solc` artifacts are not enough for this path; the current command returns a structured error instead of a raw SDK exception
- `daily-spend-limit` is the first concrete AA profile we chose for this repository, but its current policy hook only limits native-token spending
- the generic deploy / reconstruct / restore lifecycle is still not finished yet
- older `sed-lite` deployments that predate hook support cannot expose the new hook methods and need a fresh redeploy
- write commands now fail early for undeployed smart-account records instead of returning misleading previews
- so do not read current Sepolia broadcast results as proof that the long-term smart-account design is correct

## Notes

- Verified local defaults in this repository currently include:
  - `zkSync Era` chain ID `324`
  - `zkSync Sepolia` chain ID `300`
  - mainnet RPC `https://mainnet.era.zksync.io/`
  - sepolia RPC `https://sepolia.era.zksync.dev`
- Environment caveat:
  - Codex sandbox DNS has repeatedly failed to resolve otherwise healthy public RPC hosts during this project.
  - When live RPC validation matters, prefer the host shell or an approved unsandboxed command path before concluding that a node or endpoint is unavailable.
- Other Elastic Network chains should be added through explicit registry entries instead of hardcoded guesses.
