---
name: zk-agent-cli
description: Agent-facing operating guide for zk-agent-cli on zkSync Era and zkSync Sepolia. Use this skill whenever helping an agent or operator initialize local config, create or reapprove a wallet session, inspect readiness, fund the wallet, run workflow-based send/swap/bridge/deposit/withdraw actions, inspect balances, or work with the built-in sed-lite smart-account profile. The current preferred operating path is setup -> next -> wallet create/reapprove -> next -> workflow pay for the flagship native-send path, with workflow auto kept for broader multi-intent flows.
---

# zk-agent-cli Skill

## Scope

This skill documents the current stable operator path for this repository.

Use it for:

- local wallet bootstrap
- wallet reapproval and restore follow-up
- readiness inspection
- funding guidance or funding-step execution
- workflow-based onchain actions
- balances, bridge/deposit/withdraw lifecycle follow-up
- sed-lite smart-account operations already implemented in the CLI

Repository AA posture:

- use `sed-lite` for the default AA/operator path
- use `daily-spend-limit` only when a task explicitly needs that narrower
  policy profile or a constrained control wallet

Do not assume broader ecosystem integrations exist yet. In particular, this
repo does **not** currently provide Polygon-style identity, Polymarket, or
x402 surfaces.

## Sub-skills

For detailed action-path reference, also read:

- [zk-aa/SKILL.md](./zk-aa/SKILL.md)
- [zk-relay/SKILL.md](./zk-relay/SKILL.md)
- [zk-defi/SKILL.md](./zk-defi/SKILL.md)

## Prerequisites

Choose the entrypoint that matches the environment.

If this repository has not been installed into a compatible agent harness yet,
add it with:

```bash
npx skills add https://github.com/AgiWeb3/zk-agent-cli
```

This repository now also ships a native ChatGPT/Codex plugin manifest at
`.codex-plugin/plugin.json`. The command above remains the direct repo-skill
install path for compatible harnesses.

- Node.js `>=24`
- packaged CLI entrypoint:

```bash
zk-agent <command>
```

- one-shot packaged execution:

```bash
npx zk-agent-cli <command>
```

- source-checkout fallback:

```bash
pnpm zk-agent <command>
```

- `pnpm` and a repository checkout are only required for source development or
  when you intentionally run the repo-local wrapper
- the default local approval path expects the connector UI at
  `http://localhost:4444`; override it with
  `zk-agent setup --connector-url <url>` when needed
- the CLI auto-loads `.env` from the current working directory; `setup`,
  `next`, and wallet-request creation usually work without custom RPC values,
  but live chain reads or broadcasts usually need the relevant RPC variables

Storage is local-first and encrypted at rest under:

```text
~/.zk-agent/
```

Important local files/directories:

```text
~/.zk-agent/config.json
~/.zk-agent/agent/profile.json
~/.zk-agent/wallets/
~/.zk-agent/requests/
~/.zk-agent/workflows/
```

## Current canonical path

Use this path unless a task explicitly requires a lower-level command.

### 1. Initialize local defaults

```bash
zk-agent setup
```

This creates local config and records the default chain and connector URL.

### 2. Ask for the shortest valid next step

```bash
zk-agent next
```

When you need the wallet-scoped recommendation path to stay on a specific fee
mode instead of inheriting the stored wallet default:

```bash
zk-agent next --paymaster-mode sponsored
```

If you want the local operator identity to be explicit and portable instead of
anonymous local state, save it once:

```bash
zk-agent agent set --name "<operator-name>" --wallet main
```

This is the default decision point across setup, wallet bootstrap/recovery, and
stored workflow continuation.

### 3. Create or refresh a writable local wallet session

```bash
zk-agent wallet create --await-local
```

This is the preferred path on the current product baseline because the CLI waits for the
local connector callback and can immediately persist the approved session.

When the operator wants a tighter writable session, request the guardrails at
creation time instead of approving an unrestricted session first:

```bash
zk-agent wallet create --await-local --session-preset transfer-only
zk-agent wallet create --await-local --session-hours 12 --allow-contract <contract-address> --allow-transfer-to <recipient-address>
zk-agent wallet reapprove --name main --session-preset full-access
zk-agent wallet reapprove --name main --disallow-contract-calls
```

`wallet reapprove` preserves the current stored session permissions by default.
Only pass the session-policy flags when the goal is to replace those defaults.
Use `--session-preset` for the common shapes first, then add address allowlists
only when the workflow needs them.

If the wallet already exists and approval metadata is missing or expired:

```bash
zk-agent wallet reapprove --name main --await-local
zk-agent next
```

If approval is still present but the local execution signer is missing:

```bash
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
```

If the connector cannot return directly to the waiting CLI process, create the
request with `--relay-url <url>`, start the relay prototype, approve in the
connector, and then either save the generated payload or save the encrypted
relay package plus its code.

Keep that local-first path as the default baseline whenever the browser and
terminal can be colocated.

For the shortest hosted relay-backed path in one terminal process:

```bash
zk-agent relay inspect --relay-url <url>
zk-agent wallet create --relay-url <url> --wait-relay --prompt-code
zk-agent wallet reapprove --name main --relay-url <url> --wait-relay --prompt-code
```

The same path also works non-interactively when a wrapper already has the
approval code:

```bash
zk-agent wallet create --relay-url <url> --wait-relay --code <6-digit-code>
```

Start the relay:

```bash
zk-agent relay serve --public-origin https://relay.example.com
```

Current flagship AA smoke:

```bash
pnpm smoke:flagship-workflow -- --wallet <name> [--paymaster-mode approval-based|sponsored]
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <relay-url> [--paymaster-mode approval-based|sponsored]
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <relay-url> --manual-approval
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <relay-url> --manual-approval --prompt-code
```

Plain payload path:

```bash
zk-agent wallet request approve --request-id <id> --payload @approved-session.json
```

Encrypted relay path:

```bash
zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>
```

### 4. Ask for the shortest next step again after wallet approval

```bash
zk-agent next
```

Use the wallet-scoped view only when the question is specifically about one
stored wallet record:

```bash
zk-agent wallet next --name main
```

Use:

```bash
zk-agent wallet status --name main
```

when you need the same recommendation plus the underlying readiness details.

### 5. Fund only when the CLI says funding is required

```bash
zk-agent workflow fund --wallet main --amount <amount> --execute
```

If you only want guidance:

```bash
zk-agent workflow fund --wallet main
```

Do not hardcode a funding path. Use the CLI-provided route and `next` command.

### 6. Execute the real goal through workflow orchestration

Example preview:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

Example broadcast:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --broadcast
```

`workflow pay` is the preferred action entrypoint for the flagship native-send
path because it can:

- stop on missing prerequisites instead of failing late
- dispatch a separate funding step first when needed
- auto-sync metadata when requested
- persist a checkpoint when requested
- create or reuse a session approval request when `--ensure-wallet-session` is supplied, with `await-local`, manual `wallet request approve`, or auto-publish to relay plus relay-driven follow-up when `--relay-url <url>` is supplied

Keep `workflow auto` for the broader multi-intent guided workflow surface:

```bash
zk-agent workflow auto --wallet <name> --intent <intent> ... [--create-checkpoint] [--execute-when-ready]
```
- pass `--session-preset`, `--session-hours`, `--allow-transfer-to`, `--allow-contract`, `--disallow-transfers`, or `--disallow-contract-calls` together with `--ensure-wallet-session` when the workflow recovery path should reopen a constrained session instead of the default broad write session; `--session-preset intent` derives the narrowest default from the goal

Use `workflow run` only when you explicitly want the lower-level one-shot
execution surface without the guided checkpoint-oriented wrapper.

In JSON mode, the workflow surfaces and `zk-agent next --request-id <id>` now
return structured `recommendedCommands`. For tokenized intents, those follow-up
commands also include `discoverAssets`, `discoverOwnedTokens`,
`discoverTokens`, and `inspectToken` so a caller can stay on the local-first
registry path without scraping human notes.

The same JSON outputs also include `agentProfile` and `agentFollowup`, so an
agent harness can tell whether it should run `zk-agent agent set`,
`zk-agent agent show`, or relink the saved profile to the active wallet.

For the common direct execution path, the CLI also exposes intent-specific
shortcuts such as `workflow send-native`, `workflow swap`, `workflow bridge`,
`workflow deposit`, and `workflow withdraw`. These are thin wrappers around
the lower-level `workflow run --intent ...` path.

### Help entrypoints

Use the help layer that matches the current question:

- `zk-agent --help` for the top-level product path
- `zk-agent wallet --help` for wallet/session recovery
- `zk-agent workflow --help` for workflow execution and resume

## Core commands

### Setup and wallet lifecycle

```bash
zk-agent setup [--default-chain <chain>] [--connector-url <url>] [--force]
zk-agent next [--wallet <name>] [--request-id <id>]
zk-agent wallet create [--name <name>] [--chain <chain>] [--await-local] [--relay-url <url>]
zk-agent wallet reapprove [--name <name>] [--await-local] [--relay-url <url>]
zk-agent wallet status [--name <name>]
zk-agent wallet next [--name <name>]
zk-agent defaults
zk-agent resolve-token [--wallet <name>|--chain <chain>] [--symbol <symbol>|--address <address>]
zk-agent wallet sync [--name <name>] [--profile <id>]
zk-agent wallet export [--name <name>] [--include-sensitive-data]
zk-agent wallet restore --payload <json|@file> [--name <name>] [--profile <id>] [--sync]
zk-agent wallet list
zk-agent wallet address [--name <name>]
zk-agent wallet rename --name <old> --new-name <new>
zk-agent wallet remove [--name <name>]
```

### Pending wallet requests

```bash
zk-agent wallet request list
zk-agent wallet request show --request-id <id>
zk-agent wallet request await-local --request-id <id>
zk-agent wallet request relay-publish --request-id <id> --relay-url <url>
zk-agent wallet request relay-status --request-id <id> --relay-url <url> [--wait]
zk-agent wallet request approve --request-id <id> --payload <json|@file>
zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> [--wait]
zk-agent wallet request approve-local --request-id <id> --wallet-address <address> ...
```

### Workflow-first operations

```bash
zk-agent workflow plan --wallet <name> --intent <intent> ...
zk-agent workflow fund --wallet <name> [--amount <amount>] [--execute]
zk-agent workflow auto --wallet <name> --intent <intent> ... [--create-checkpoint] [--execute-when-ready]
zk-agent workflow status --request-id <id>
zk-agent workflow next --request-id <id>
zk-agent workflow resume --request-id <id> [--broadcast]
zk-agent workflow send-native --wallet <name> --to <address> --amount <amount> ...
zk-agent workflow swap --wallet <name> [--token-in <address>|--token-in-symbol <symbol>] [--token-out <address>|--token-out-symbol <symbol>] ...
zk-agent workflow bridge --wallet <name> --amount <amount> [--to-chain <chain>] ...
zk-agent workflow run --wallet <name> --intent <intent> ...
zk-agent workflow list
zk-agent workflow show --request-id <id>
zk-agent workflow update --request-id <id> ...
zk-agent workflow delete --request-id <id>
```

`workflow plan` now fills the tracked default `swap` or `bridge` route when the
current registry/default set makes the destination unambiguous; the broader
`workflow` bridge path also reuses that tracked default when `--to-chain` is
omitted. Override `--protocol` or `--to-chain` when you intentionally want a
different path.

The direct `bridge` command also reuses the tracked default destination route
for the current wallet chain when `--to-chain` is omitted.

Valid intents:

- `send-native`
- `send-token`
- `call-write`
- `swap`
- `bridge`
- `deposit`
- `withdraw`

### Direct action commands

These exist, but use them when you intentionally want the lower-level path.
For funding, prefer `workflow fund`; the top-level `fund` command remains as the
raw alias.

```bash
zk-agent balances [--wallet <name>] [--chain <chain>] [--chains <csv>] [--owned-tokens]
zk-agent assets [--wallet <name>] [--chain <chain>]
zk-agent fund [--wallet <name>] [--amount <value>] [--execute] [--broadcast]
zk-agent send --wallet <name> --to <address> --amount <value> [--broadcast]
zk-agent send-token --wallet <name> [--token <address>|--symbol <symbol>] --to <address> --amount <value> [--broadcast]
zk-agent call --wallet <name> --mode read|write --to <address> --data <hex> [--broadcast]
zk-agent swap --wallet <name> --protocol <protocol> [--token-in <address>|--token-in-symbol <symbol>] [--token-out <address>|--token-out-symbol <symbol>] ...
zk-agent bridge --wallet <name> --amount <value> [--to-chain <chain>] [--broadcast]
zk-agent bridge-status --wallet <name> --tx-hash <hash> --from-chain <chain> --to-chain <chain>
zk-agent deposit --wallet <name> --amount <value> [--token <address>] [--broadcast]
zk-agent deposit-status --tx-hash <hash> --chain <chain>
zk-agent withdraw --wallet <name> --amount <value> [--token <address>] [--broadcast]
zk-agent withdraw-status --wallet <name> --tx-hash <hash>
zk-agent withdraw-finalize --wallet <name> --tx-hash <hash> [--broadcast]
```

Use `--owned-tokens` only on the single-chain path. It probes the current
local-first token registry and merges any non-zero ERC-20 holdings into the
returned balances view. Keep it for the raw `balances` surface; otherwise
prefer `assets`.

Use `assets` when that richer single-chain view is the intent and you do not
need multi-chain aggregation.

When `--protocol` is omitted, direct `swap` follows the current
registry-backed validated swap path.

For `syncswap-classic`, the CLI can fill the tracked zkSync Sepolia router and
factory defaults when those flags are omitted.

For locally deployed test assets recorded under
`packages/paymaster-test-assets/deployments`, tokenized `fund`,
`send-token`, `swap`, `bridge`, `deposit`, `withdraw`, and the matching
workflow intents can also resolve token address/decimals from the stored
symbol on the active chain.

If `ZK_AGENT_TOKEN_DIRECTORY_ROOT` points at a local token-directory checkout
or export with `index/index.json`, the same commands can also fall back to that
directory after checking local deployment metadata first.

To generate that local export from this repo's own deployment records, run
`pnpm --filter @zk-agent/paymaster-test-assets export:token-directory` and set
`ZK_AGENT_TOKEN_DIRECTORY_ROOT=packages/paymaster-test-assets/token-directory`.
That export path is source-checkout-only; it is not part of the packaged npm
surface by itself.

Use `zk-agent defaults` when you need the current token-registry source
order and token-directory chain coverage in machine-readable form.

Use `zk-agent tokens --chain zksync-sepolia` to inspect the current
discoverable token set for one chain.

Use `zk-agent tokens --chain zksync-sepolia --symbol USDC` when you want
to inspect all discoverable entries for one symbol before choosing an explicit
token address.

Use `zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token`
when one symbol maps to multiple local entries and you only want the token that
currently fills one tracked defaults-registry role.

Add `--source local-deployments|token-directory` when you want to stay inside
one discovery source instead of the merged local-first view. The suggested
follow-up commands now preserve that source filter too.

Use `zk-agent tokens --wallet main --owned` when you want the stored
wallet's currently held registry-backed ERC-20 assets on its active chain.
That owned-token view now also includes shared-bridge mapping status plus a
structured summary of source counts, bridge-mapping counts, and tracked
registry-role counts. Treat this as the narrower ERC-20 subset view; for the
default asset view, start with `assets`.

Use `zk-agent resolve-token --chain zksync-sepolia --symbol USDC` when you
need a direct token-resolution check before running a tokenized command.

Add `--role swap-token-a|swap-token-b|paymaster-fee-token` when you need that
resolution narrowed to one tracked default role instead of the whole symbol set.

Add `--source local-deployments|token-directory` when you need to confirm one
source-specific resolution path only.

### Built-in smart-account profiles

List profiles:

```bash
zk-agent wallet smart-account profiles
```

Generic predict/deploy:

```bash
zk-agent wallet smart-account predict --name <name> --profile sed-lite
zk-agent wallet smart-account deploy --name <name> --profile sed-lite
```

The packaged CLI now ships the built-in profile artifacts for the first-party
profiles. `ZK_AGENT_ACCOUNT_PROFILES_ROOT` is only needed when the CLI runs
from a source checkout or a custom runtime layout and you want to override the
artifact root manually.

The primary built-in account model is:

- `sed-lite`

The narrower experimental profile is:

- `daily-spend-limit`

### sed-lite management

Supported command families include:

```bash
zk-agent wallet smart-account sed-lite owner --name <name>
zk-agent wallet smart-account sed-lite owner-set --name <name> --address <address>
zk-agent wallet smart-account sed-lite validator --name <name>
zk-agent wallet smart-account sed-lite validator-set --name <name> --address <address>
zk-agent wallet smart-account sed-lite module --name <name> --module <address>
zk-agent wallet smart-account sed-lite module-add --name <name> --module <address>
zk-agent wallet smart-account sed-lite module-remove --name <name> --module <address>
zk-agent wallet smart-account sed-lite hook --name <name> --hook <address>
zk-agent wallet smart-account sed-lite hooks --name <name>
zk-agent wallet smart-account sed-lite hook-add --name <name> --hook <address> [--init-data <hex>]
zk-agent wallet smart-account sed-lite hook-remove --name <name> --hook <address>
zk-agent wallet smart-account sed-lite limit --name <name>
zk-agent wallet smart-account sed-lite limit-set --name <name> --amount <value>
zk-agent wallet smart-account sed-lite limit-remove --name <name>
```

Validation-hook helpers are also implemented for:

- `native-cap-hook`
- `target-allowlist-hook`
- `selector-allowlist-hook`

## Paymaster guidance

Supported paymaster modes:

- `none`
- `sponsored`
- `approval-based`

Important rule:

- do **not** assume any ERC-20 can be used for approval-based fee payment
- fee-token compatibility is a validated matrix, not a generic ERC-20 property
- on `zksync-sepolia`, if only `--paymaster-mode approval-based` is set, the CLI/provider will try the tracked validated paymaster + EraVM fee-token defaults from `zk-agent defaults`

When a swap or send path is failing under approval-based estimation, first
separate the base transaction path from the fee-token path:

```bash
zk-agent send --wallet main --to <address> --amount <amount> --paymaster-mode none
```

```bash
zk-agent swap --wallet main --protocol <protocol> ... --paymaster-mode none
```

## Tool surface

This repo also ships agent-facing tool wrappers under `packages/agent-tools`.

List available tools:

```bash
pnpm tool:list
```

In that list, high-frequency entries are surfaced first and each item includes a
`group` field plus the closest `cliCommand` equivalent. Key operator-path tools
also include `exampleInput`, including the session-policy preset fields used for
guided reapproval. Prefer `workflowPayTool` for the flagship native-pay path
and `workflowAutoTool` for broader guided workflow orchestration.
`workflowOrchestratorTool` is kept as a compatibility alias for the same path.

For the canonical operator path, key tools also expose `operatorPathStage`:

- `decide-next` for the top-level routing step
- `acquire-session` for wallet create/reapprove approval paths
- `guided-execution` for `workflowPayTool` by default, with `workflowAutoTool`
  kept for broader intents
- `funding-fallback` for `workflowFundTool`
- `checkpoint-follow-up` for stored workflow status/next/resume tools

The list response also includes a top-level `recommendedSequence` that orders
those stages into the default product path.

Run one tool:

```bash
pnpm tool:run -- --tool <toolName> --input <json|@file>
pnpm tool:run -- --tool getAssetsTool --input '{"walletName":"main"}'
pnpm tool:run -- --tool walletReapproveTool --input '{"walletName":"main","policyPreset":"full-access"}'
pnpm tool:run -- --tool workflowOrchestratorTool --input '{"walletName":"main","intent":"send-native","goal":{"intent":"send-native","to":"0x1111111111111111111111111111111111111111","amount":"0.001"},"ensureWalletSession":true,"approvalPolicyPreset":"intent","createCheckpoint":true}'
```

Use the tool surface when you need stable programmatic input/output rather than
shell-oriented CLI behavior.

For session recovery, keep the tool inputs aligned with the CLI:

- `walletReapproveTool.policyPreset`
  supports `full-access`, `transfer-only`, `contract-only`, `readonly`
- `workflowOrchestratorTool.approvalPolicyPreset`
  supports the same values plus `intent`, which derives the narrowest default
  from the workflow goal

## Known environment constraint

In the Codex sandbox used for this repo, DNS resolution for public RPC hosts can
fail even when the endpoint itself is healthy.

If `sepolia.era.zksync.dev` or another public RPC hostname fails inside the
sandbox:

- do not immediately conclude the endpoint is down
- retry from the host shell or an approved unsandboxed command

## What not to assume

- the packaged CLI target is `zk-agent-cli`, and the default command path in
  this skill is `zk-agent ...`; only switch back to `pnpm zk-agent ...` when
  you are intentionally operating from a repository checkout
- there is only a local hosted relay prototype; it is file-backed and suitable for development, not a production multi-tenant relay service
- there is no broad identity or reputation product layer yet
- there is no guarantee that custom local ERC-20 assets can bridge through the
  shared bridge path
- there is no guarantee that every direct action command is the preferred path;
  prefer `wallet next`, `workflow pay` for the flagship native-send path, and
  `workflow auto` for broader multi-intent flows

## Quickstart

Read:

- [QUICKSTART.md](./QUICKSTART.md)
- [zk-defi/SKILL.md](./zk-defi/SKILL.md)
