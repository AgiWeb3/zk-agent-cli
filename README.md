# zk-agent-cli

`zk-agent-cli` is a local-first monorepo for building an agent-oriented CLI on top of `zkSync Era` and the wider `ZK Stack`.

Core references:

- [PROJECT_STATE.md](./PROJECT_STATE.md)
- [PLANS.md](./PLANS.md)

Agent-facing references:

- [skills/SKILL.md](./skills/SKILL.md)
- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [skills/zk-aa/SKILL.md](./skills/zk-aa/SKILL.md)
- [skills/zk-relay/SKILL.md](./skills/zk-relay/SKILL.md)
- [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

The project is intentionally modeled after the real architecture of `polygon-agent-cli`, but it is not a direct fork. The goal is to preserve the reusable system shape:

- CLI entrypoint for humans and agent harnesses
- browser connector UI for session approval
- shared protocol package for session payloads, relay messages, and crypto
- core package for storage, chain registry, and provider interfaces
- provider packages for zkSync-specific wallet and DeFi capabilities
- agent tool adapters for LLM / framework integration

## Public Entry Points

There are now three explicit public entry points:

- agent-harness skill install for compatible runtimes:
  - `npx skills add https://github.com/AgiWeb3/zk-agent-cli`
- packaged CLI for public/operator use:
  - `npx zk-agent-cli --help`
  - `npm install -g zk-agent-cli`
  - binaries: `zk-agent`, `zksync-agent`
- repo-local development and contributor smoke work:
  - `pnpm install`
  - `pnpm zk-agent --help`

Use the skill install when the operator is adding this repo to a compatible
agent harness. Use the packaged CLI when the operator wants a direct terminal
tool. Keep the repo-local wrapper for contributors and source-checkout smoke
work only.

Release snapshot:

- the current public beta, `zk-agent-cli@0.1.0-beta.7`, was published on
  `2026-08-10`
- the local workspace is now continuing post-publish iteration on top of the
  `zk-agent-cli@0.1.0-beta.7` baseline
- release validation remains local and explicit through
  `pnpm validate:release`
- the public npm dist-tags are currently aligned:
  `beta -> 0.1.0-beta.7`, `latest -> 0.1.0-beta.7`
- public agent-harness docs now default to
  `npx skills add https://github.com/AgiWeb3/zk-agent-cli`
- public operator docs now default to the packaged `zk-agent ...` surface
- inside this repository, `pnpm zk-agent ...` remains the development/runtime
  wrapper for contributors and local smoke work

## Current Status

The product baseline is already in place:

- the public npm package is live and installable
- the local-first wallet/session lifecycle is implemented
- hosted relay approval is proven end to end
- the flagship zkSync-native AA path is `workflow pay` on `sed-lite`
- the agent-facing docs are split into stable skill slices:
  `zk-aa`, `zk-relay`, and `zk-defi`

The active work is now productization closeout rather than new protocol
scaffolding:

- unify public install and onboarding entrypoints
- harden the hosted relay from a validated prototype toward a clearer operated
  contract
- reduce release/version/doc drift after publish
- improve token/asset discovery around the current validated Sepolia paths

## Implemented Surface

- monorepo boundaries are in place:
  - CLI package
  - connector UI
  - shared session / relay protocol
  - core storage and registry layer
  - zkSync wallet and DeFi providers
  - built-in account profiles in `packages/account-profiles`
- the operator baseline is real:
  - `setup -> next -> wallet create|reapprove -> next -> workflow pay`
  - wallet-specific recovery through `wallet status`, `wallet next`, and
    `wallet signer attach`
  - workflow-specific recovery through checkpointed `workflow status|next|resume`
- local-first wallet/session lifecycle is implemented:
  - local callback path through `--await-local`
  - hosted/manual recovery path through `--relay-url`
  - `wallet sync`
  - `wallet export|restore`
  - policy-scoped reapproval through session presets and allowlists
- hosted relay approval is shipped as a product surface:
  - `relay inspect`
  - `relay serve`
  - share-link approval flow
  - packaged connector UI bundled into the published CLI
- the flagship workflow layer is in place:
  - `workflow pay` as the default native-send path
  - `workflow auto|plan|run|fund`
  - local checkpoint lifecycle through `workflow start|list|show|update|delete`
- discovery and defaults surfaces are in place:
  - `defaults`
  - `assets`
  - `balances`
  - `tokens`
  - `resolve-token`
  - registry-backed route, token, and paymaster metadata in both TTY and JSON
- execution surfaces are in place for the validated zkSync Sepolia path:
  - `send`
  - `send-token`
  - `call`
  - `swap`
  - `bridge`
  - `deposit`
  - `withdraw`
  - `withdraw-finalize`
- smart-account and paymaster support is in place:
  - `sed-lite` is the primary AA baseline
  - `daily-spend-limit` remains available for narrower policy coverage
  - approval-based and sponsored paymaster defaults are surfaced through the
    registry-backed Sepolia baseline
- agent-facing surfaces are real, not just prose:
  - local operator identity through `agent status|show|set|export|import|clear`
  - `packages/agent-tools` wrappers for wallet, workflow, asset, and approval
    flows
  - smoke scripts for operator path, hosted relay, remote approval, flagship
    workflow, and discovery/default inspection
- detailed command inventory, smoke entrypoints, and validation notes remain in
  the sections below plus:
  - [PROJECT_STATE.md](./PROJECT_STATE.md)
  - [PLANS.md](./PLANS.md)
  - [skills/QUICKSTART.md](./skills/QUICKSTART.md)

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

The canonical operator path is:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
# Only if the CLI reports that gas funding is still required:
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Interpretation:

1. `setup` writes local config.
2. `next` is the default decision point. Use it whenever you want the shortest
   valid next step across setup, wallet recovery, and stored workflows.
3. `wallet create --await-local` or `wallet reapprove --await-local` is the
   preferred local-first connector path for obtaining a writable local
   session; run `zk-agent next` again after the approval round-trip finishes.
4. `wallet next` and `wallet status` are the wallet-layer detailed views when
   the question is specifically about one stored wallet.
5. `workflow pay` is the default guided execution surface for the flagship
   native-send path. Use `workflow auto` when the workflow intent is broader
   than that one productized path.
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
zk-agent workflow pay --wallet main --to <recipient-address> --amount <amount>
```

`zk-agent next` is the default decision point. It chooses between setup,
wallet bootstrap/recovery, and workflow continuation. `workflow pay` is the
default guided action entry for the current flagship native-send path once the
wallet is writable; keep `workflow auto` for the broader multi-intent guided
surface. If gas is still missing, the guided path points to `workflow fund` as
the next step. The root help output now also prioritizes `next`, `wallet`,
and `workflow` before the lower-level command families, so the product path is
visible before the raw primitives.

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
zk-agent next
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
zk-agent wallet reapprove --name main --session-preset full-access
zk-agent wallet reapprove --name main --disallow-contract-calls
zk-agent relay inspect --relay-url <url>
zk-agent wallet create --relay-url <url> --wait-relay --prompt-code
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code
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
capabilities entirely. Use `wallet reapprove` when approval metadata is
missing or expired. Use `wallet signer attach --name <wallet> --private-key
<hex>` when approval is still present but the local execution signer is
missing. The local-first path stays preferred when the browser and terminal
can live on the same machine; switch to the hosted relay path only when they
cannot. Keep
`wallet request approve --request-id <id> --relay-url <url> --code <code> --wait`
for the lower-level manual relay fallback after a request has already been
created or published.

### 3. Workflow entrypoint

Use `zk-agent workflow --help` when the user intent is already known and
you want the execution path. This is the action-layer view:

```bash
zk-agent workflow pay --wallet main --to <recipient-address> --amount <amount>
zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready
zk-agent workflow pay --wallet main --to <recipient-address> --amount <amount> --ensure-wallet-session --session-preset intent
zk-agent workflow auto --wallet main --intent <intent> --ensure-wallet-session --session-hours 12 --allow-contract <contract-address>
zk-agent workflow start --wallet main --intent <intent> [goal flags]
zk-agent workflow status --request-id <id>
zk-agent workflow next --request-id <id>
zk-agent workflow resume --request-id <id> [--broadcast]
zk-agent workflow fund --wallet main --amount <amount> --execute
zk-agent workflow run --wallet main --intent <intent> [goal flags]
```

Use `workflow pay` when the goal is the current flagship AA native-send path:
it fixes the workflow to `send-native`, persists a checkpoint, executes when
ready, reopens a missing writable session through the intent-scoped approval
path, and defaults to approval-based paymaster mode unless you override it.
Use `workflow auto` for the broader guided default path. Use
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
pnpm tool:run -- --tool workflowPayTool --input '{"walletName":"main","to":"0x1111111111111111111111111111111111111111","amount":"0.001"}'
pnpm tool:run -- --tool walletReapproveTool --input '{"walletName":"main","policyPreset":"full-access"}'
pnpm tool:run -- --tool workflowOrchestratorTool --input '{"walletName":"main","intent":"send-native","goal":{"intent":"send-native","to":"0x1111111111111111111111111111111111111111","amount":"0.001"},"ensureWalletSession":true,"approvalPolicyPreset":"intent","createCheckpoint":true}'
pnpm smoke:discovery -- --wallet <name> [--symbol <symbol>]
pnpm smoke:flagship-workflow -- --wallet <name> [--paymaster-mode approval-based|sponsored]
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <relay-url> --manual-approval
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <relay-url> --manual-approval --prompt-code
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
- `pnpm smoke:flagship-workflow -- --wallet <name> [--relay-url <url>] [--paymaster-mode approval-based|sponsored] [--execute] [--manual-approval] [--code <code>|--prompt-code]`
  validates the current flagship AA operator story in one narrower
  sequence: use a `sed-lite` wallet for the acceptance baseline; with
  `--relay-url` it first validates the external hosted relay,
  then runs relay-backed wallet reapproval on the existing wallet, then the
  paymaster-backed `workflow pay` flagship path on that same wallet; with
  `--manual-approval` it can stop after publish for a real browser operator or
  continue after a supplied approval code; it is the productized AA signature
  path, not a broad DeFi breadth harness
- `pnpm smoke:operator-path -- --wallet <name> [--paymaster-mode none|approval-based|sponsored]` validates the canonical
  `next -> wallet -> workflow pay -> funding fallback or goal preview` path
  and now accepts an optional `--paymaster-mode` override so the operator-path
  guidance can be previewed against a specific fee path instead of always
  inheriting the stored wallet default, and returns structured follow-up fields
  in `summary`, including
  `topLevelRecommendedCommands`, `workflowRecommendedCommands`,
  `topLevelAgentFollowup`, and `workflowAgentFollowup`
- `pnpm smoke:product-path -- --wallet <name> [--tx-hash <withdrawTxHash>] [--paymaster-mode approval-based|sponsored] [--execute-swap]`
  aggregates the current product-level live validation sequence:
  canonical operator path, validated paymaster-backed `workflow pay` flagship path,
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
- `pnpm smoke:remote-approval -- --wallet <name> [--chain <chain>] [--relay-url <url>] [--manual-approval] [--code <code>|--prompt-code]`
  validates the relay-backed create -> publish -> pending -> ready -> approve
  -> import lifecycle through the real CLI JSON surface, using a local relay
  automatically when `--relay-url` is omitted; `--manual-approval` uses the
  real browser/share-link approval path instead of auto-submitting a
  synthetic encrypted payload
- `pnpm validate:phase3` runs the legacy Phase 3 regression set across
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
- future AA defaults, flagship workflow validation, and operator-facing
  examples should stay on `sed-lite`
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
- `daily-spend-limit` should not be used as the default AA acceptance wallet:
  it is now treated as a constrained experimental profile, not the repository
  baseline
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
