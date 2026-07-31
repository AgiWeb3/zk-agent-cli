# zk-agent-cli

`zk-agent-cli` is the packaged `zk-agent-cli` command surface for zkSync Era
and zkSync Sepolia.

Current strengths:

- local-first wallet/session storage
- `next`-first operator guidance
- relay-backed approval and reapproval
- workflow orchestration for send, swap, bridge, deposit, and withdraw
- machine-readable JSON output for agent callers

## Install

One-shot execution:

```bash
npx zk-agent-cli --help
```

Global install:

```bash
npm install -g zk-agent-cli
zk-agent --help
```

The package also ships the secondary binary name:

```bash
zksync-agent --help
```

## Prerequisites

- Node.js `>=24` if you install globally.
- The default local approval path expects the connector UI to be reachable at
  `http://localhost:4444`. Override it with
  `zk-agent setup --connector-url <url>` when needed.
- The CLI auto-loads `.env` from the current working directory.

You do not need a custom `.env` just to run `setup`, `next`, or create a local
wallet request. You usually do need one for live chain reads or broadcasts.

Most relevant environment variables:

```bash
ZKSYNC_SEPOLIA_RPC_URL=
ETHEREUM_SEPOLIA_RPC_URL=
ZK_AGENT_TOKEN_DIRECTORY_ROOT=
ZK_AGENT_STORAGE_DIR=
```

Use:

- `ZKSYNC_SEPOLIA_RPC_URL` for explicit zkSync Sepolia reads/broadcasts
- `ETHEREUM_SEPOLIA_RPC_URL` for L1 deposit/bridge follow-up flows on Sepolia
- `ZK_AGENT_TOKEN_DIRECTORY_ROOT` when you want local token-directory symbol
  resolution
- `ZK_AGENT_STORAGE_DIR` only when you need to override the default local
  storage path

## Shortest Path

Fresh setup:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready
```

If a wallet already exists and only the writable session is stale, use:

```bash
zk-agent wallet reapprove --name main --await-local
zk-agent next
```

Only fund when the CLI says funding is actually required:

```bash
zk-agent workflow fund --wallet main --amount <amount> --execute
```

## Remote Approval

Shortest relay-backed path in one command:

```bash
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code
```

Local relay prototype path:

```bash
zk-agent relay serve
zk-agent wallet create --relay-url <relay-url>
zk-agent wallet request approve --request-id <id> --relay-url <relay-url> --code <code> --wait
```

The built-in relay is a local file-backed prototype. It is useful for operator
testing, not a production hosted relay service.

## Local Storage

By default the CLI stores config, wallets, requests, and workflow checkpoints
under:

```text
~/.zk-agent/
```

Common files created by the default path:

- `config.json`
- `wallets/*.json`
- `requests/*.json`
- `workflow-checkpoints/*.json`

## Smart-Account Profiles

The published package can inspect built-in profiles:

```bash
zk-agent wallet smart-account profiles --json
```

Current boundary:

- profile inspection works from the packaged CLI
- built-in profile deploys still require
  `ZK_AGENT_ACCOUNT_PROFILES_ROOT=<checked-out account-profiles package dir>`
  because the npm tarball does not ship the EraVM profile artifacts

## Common Failures

Connector callback never arrives:

- verify the connector URL saved by `zk-agent setup`
- if local callback is not possible in your environment, switch to the relay
  path with `zk-agent relay serve` plus `wallet create|reapprove --relay-url`

CLI says the wallet is missing a writable session:

- run `zk-agent wallet reapprove --name <wallet> --await-local`
- then rerun `zk-agent next` or the blocked workflow command

Workflow stops on funding:

- do not guess the route
- run the exact `workflow fund` command suggested by the CLI

Relay / `--await-local` flows fail in a locked-down environment:

- those flows need a process that can bind `127.0.0.1`
- rerun from a normal host shell or use the relay/manual approval path

## Command Help

For the canonical command surfaces:

```bash
zk-agent --help
zk-agent wallet --help
zk-agent workflow --help
```

## License

MIT. See the repository `LICENSE`.
