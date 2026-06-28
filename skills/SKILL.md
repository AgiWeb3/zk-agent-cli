---
name: zk-agent-cli
description: Agent-facing operating guide for zk-agent-cli on zkSync Era and zkSync Sepolia. Use this skill whenever helping an agent or operator initialize local config, create or reapprove a wallet session, inspect readiness, fund the wallet, run workflow-based send/swap/bridge/deposit/withdraw actions, inspect balances, or work with the built-in sed-lite smart-account profile. The current preferred operating path is setup -> wallet create/reapprove -> wallet next/status -> fund -> workflow run.
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

Do not assume broader ecosystem integrations exist yet. In particular, this
repo does **not** currently provide Polygon-style identity, Polymarket, or
x402 surfaces.

## Sub-skills

For detailed action-path reference, also read:

- [zk-defi/SKILL.md](./zk-defi/SKILL.md)

## Prerequisites

- Node.js `>=24`
- `pnpm`
- repository dependencies installed with `pnpm install`
- run commands from the repository root
- entrypoint from source:

```bash
pnpm zk-agent <command>
```

Storage is local-first and encrypted at rest under:

```text
~/.zk-agent/
```

Important local files/directories:

```text
~/.zk-agent/config.json
~/.zk-agent/wallets/
~/.zk-agent/requests/
~/.zk-agent/workflows/
```

## Current canonical path

Use this path unless a task explicitly requires a lower-level command.

### 1. Initialize local defaults

```bash
pnpm zk-agent setup
```

This creates local config and records the default chain and connector URL.

### 2. Create a writable local wallet session

```bash
pnpm zk-agent wallet create --await-local
```

This is the preferred path in the current phase because the CLI waits for the
local connector callback and can immediately persist the approved session.

If the wallet already exists but no longer has a writable local session:

```bash
pnpm zk-agent wallet reapprove --name main --await-local
```

If the connector cannot return directly to the waiting CLI process, create the
request without `--await-local`, start the relay prototype, publish the request
to the relay, approve in the connector, and then either save the generated
payload or save the encrypted relay package plus its code.

Start the relay:

```bash
pnpm zk-agent relay serve
```

Publish the request:

```bash
pnpm zk-agent wallet request relay-publish --request-id <id> --relay-url <relay-url>
```

Plain payload path:

```bash
pnpm zk-agent wallet request approve --request-id <id> --payload @approved-session.json
```

Encrypted relay path:

```bash
pnpm zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>
```

### 3. Inspect the shortest next step

```bash
pnpm zk-agent wallet next --name main
```

Use:

```bash
pnpm zk-agent wallet status --name main
```

when you need the same recommendation plus the underlying readiness details.

### 4. Fund only when the CLI says funding is required

```bash
pnpm zk-agent fund --wallet main --amount <amount> --execute
```

If you only want guidance:

```bash
pnpm zk-agent fund --wallet main
```

Do not hardcode a funding path. Use the CLI-provided route and `next` command.

### 5. Execute the real goal through workflow orchestration

Example preview:

```bash
pnpm zk-agent workflow run --wallet main --intent send-native --to <address> --amount <amount>
```

Example broadcast:

```bash
pnpm zk-agent workflow run --wallet main --intent send-native --to <address> --amount <amount> --broadcast
```

`workflow run` is the preferred action entrypoint because it can:

- stop on missing prerequisites instead of failing late
- dispatch a separate funding step first when needed
- auto-sync metadata when requested
- create or reuse a session approval request when `--ensure-wallet-session` is supplied, with `await-local`, manual `wallet request approve`, or relay-driven follow-up when `--relay-url <url>` is supplied

For the common direct execution path, the CLI also exposes intent-specific
shortcuts such as `workflow send-native`, `workflow swap`, `workflow bridge`,
`workflow deposit`, and `workflow withdraw`. These are thin wrappers around
`workflow run --intent ...`.

## Core commands

### Setup and wallet lifecycle

```bash
pnpm zk-agent setup [--default-chain <chain>] [--connector-url <url>] [--force]
pnpm zk-agent wallet create [--name <name>] [--chain <chain>] [--await-local]
pnpm zk-agent wallet reapprove [--name <name>] [--await-local]
pnpm zk-agent wallet status [--name <name>]
pnpm zk-agent wallet next [--name <name>]
pnpm zk-agent defaults
pnpm zk-agent wallet sync [--name <name>] [--profile <id>]
pnpm zk-agent wallet export [--name <name>] [--include-sensitive-data]
pnpm zk-agent wallet restore --payload <json|@file> [--name <name>] [--profile <id>] [--sync]
pnpm zk-agent wallet list
pnpm zk-agent wallet address [--name <name>]
pnpm zk-agent wallet rename --name <old> --new-name <new>
pnpm zk-agent wallet remove [--name <name>]
```

### Pending wallet requests

```bash
pnpm zk-agent wallet request list
pnpm zk-agent wallet request show --request-id <id>
pnpm zk-agent wallet request await-local --request-id <id>
pnpm zk-agent wallet request relay-publish --request-id <id> --relay-url <url>
pnpm zk-agent wallet request relay-status --request-id <id> --relay-url <url>
pnpm zk-agent wallet request approve --request-id <id> --payload <json|@file>
pnpm zk-agent wallet request approve-local --request-id <id> --wallet-address <address> ...
```

### Workflow-first operations

```bash
pnpm zk-agent workflow plan --wallet <name> --intent <intent> ...
pnpm zk-agent workflow run --wallet <name> --intent <intent> ...
pnpm zk-agent workflow send-native --wallet <name> --to <address> --amount <amount> ...
pnpm zk-agent workflow swap --wallet <name> --token-in <address> --token-out <address> ...
pnpm zk-agent workflow bridge --wallet <name> --amount <amount> --to-chain <chain> ...
pnpm zk-agent workflow status --wallet <name> --intent <intent> ...
pnpm zk-agent workflow resume --wallet <name> --intent <intent> ...
pnpm zk-agent workflow list
pnpm zk-agent workflow show --request-id <id>
pnpm zk-agent workflow update --request-id <id> ...
pnpm zk-agent workflow delete --request-id <id>
```

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

```bash
pnpm zk-agent balances [--wallet <name>] [--chain <chain>] [--chains <csv>]
pnpm zk-agent fund [--wallet <name>] [--amount <value>] [--execute] [--broadcast]
pnpm zk-agent send --wallet <name> --to <address> --amount <value> [--broadcast]
pnpm zk-agent send-token --wallet <name> --token <address> --to <address> --amount <value> [--broadcast]
pnpm zk-agent call --wallet <name> --mode read|write --to <address> --data <hex> [--broadcast]
pnpm zk-agent swap --wallet <name> --protocol <protocol> ...
pnpm zk-agent bridge --wallet <name> --to-chain <chain> --amount <value> [--broadcast]
pnpm zk-agent bridge-status --wallet <name> --tx-hash <hash> --from-chain <chain> --to-chain <chain>
pnpm zk-agent deposit --wallet <name> --amount <value> [--token <address>] [--broadcast]
pnpm zk-agent deposit-status --tx-hash <hash> --chain <chain>
pnpm zk-agent withdraw --wallet <name> --amount <value> [--token <address>] [--broadcast]
pnpm zk-agent withdraw-status --wallet <name> --tx-hash <hash>
pnpm zk-agent withdraw-finalize --wallet <name> --tx-hash <hash> [--broadcast]
```

For `syncswap-classic`, the CLI can fill the tracked zkSync Sepolia router and
factory defaults when those flags are omitted.

### Built-in smart-account profiles

List profiles:

```bash
pnpm zk-agent wallet smart-account profiles
```

Generic predict/deploy:

```bash
pnpm zk-agent wallet smart-account predict --name <name> --profile sed-lite
pnpm zk-agent wallet smart-account deploy --name <name> --profile sed-lite
```

The primary built-in account model is:

- `sed-lite`

The narrower experimental profile is:

- `daily-spend-limit`

### sed-lite management

Supported command families include:

```bash
pnpm zk-agent wallet smart-account sed-lite owner --name <name>
pnpm zk-agent wallet smart-account sed-lite owner-set --name <name> --address <address>
pnpm zk-agent wallet smart-account sed-lite validator --name <name>
pnpm zk-agent wallet smart-account sed-lite validator-set --name <name> --address <address>
pnpm zk-agent wallet smart-account sed-lite module --name <name> --module <address>
pnpm zk-agent wallet smart-account sed-lite module-add --name <name> --module <address>
pnpm zk-agent wallet smart-account sed-lite module-remove --name <name> --module <address>
pnpm zk-agent wallet smart-account sed-lite hook --name <name> --hook <address>
pnpm zk-agent wallet smart-account sed-lite hooks --name <name>
pnpm zk-agent wallet smart-account sed-lite hook-add --name <name> --hook <address> [--init-data <hex>]
pnpm zk-agent wallet smart-account sed-lite hook-remove --name <name> --hook <address>
pnpm zk-agent wallet smart-account sed-lite limit --name <name>
pnpm zk-agent wallet smart-account sed-lite limit-set --name <name> --amount <value>
pnpm zk-agent wallet smart-account sed-lite limit-remove --name <name>
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

When a swap or send path is failing under approval-based estimation, first
separate the base transaction path from the fee-token path:

```bash
pnpm zk-agent send --wallet main --to <address> --amount <amount> --paymaster-mode none
```

```bash
pnpm zk-agent swap --wallet main --protocol <protocol> ... --paymaster-mode none
```

## Tool surface

This repo also ships agent-facing tool wrappers under `packages/agent-tools`.

List available tools:

```bash
pnpm --filter @zk-agent/agent-tools tool:run -- --list
```

Run one tool:

```bash
pnpm --filter @zk-agent/agent-tools tool:run -- --tool <toolName> --input <json|@file>
```

Use the tool surface when you need stable programmatic input/output rather than
shell-oriented CLI behavior.

## Known environment constraint

In the Codex sandbox used for this repo, DNS resolution for public RPC hosts can
fail even when the endpoint itself is healthy.

If `sepolia.era.zksync.dev` or another public RPC hostname fails inside the
sandbox:

- do not immediately conclude the endpoint is down
- retry from the host shell or an approved unsandboxed command

## What not to assume

- there is no published npm package for this repo documented here
- there is only a local hosted relay prototype; it is file-backed and suitable for development, not a production multi-tenant relay service
- there is no broad identity or reputation product layer yet
- there is no guarantee that custom local ERC-20 assets can bridge through the
  shared bridge path
- there is no guarantee that every direct action command is the preferred path;
  prefer `wallet next` and `workflow run`

## Quickstart

Read:

- [QUICKSTART.md](./QUICKSTART.md)
- [zk-defi/SKILL.md](./zk-defi/SKILL.md)
