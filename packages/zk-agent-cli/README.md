# zk-agent-cli

`zk-agent-cli` is the packaged terminal CLI for the zk-agent operator path on
zkSync Era and zkSync Sepolia.

This file is the canonical operator manual for CLI users.

## One-minute path

Use this path unless the task explicitly needs a lower-level command:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent suite
```

Interpretation:

- `setup` writes local defaults
- `next` gives the shortest valid follow-up step
- `wallet create --await-local` is the preferred local approval path
- `workflow pay` is the flagship zkSync-native AA native-send path
- `suite` is the packaged post-flagship entrypoint for discovery, defaults,
  funding, and paymaster readiness

If readiness is unclear before you choose a fix, use:

```bash
zk-agent doctor
```

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

The package also ships the alias:

```bash
zksync-agent --help
```

## Defaults and prerequisites

- Node.js `>=24`
- the default chain is `zksync-sepolia`
- the default local approval callback is `http://localhost:4444`
- the CLI auto-loads `.env` from the current working directory

You do not need a custom `.env` just to run `setup`, `next`, `doctor`, or
create a wallet request. You usually do need RPC values for live reads or
broadcasts.

Most relevant environment variables:

```bash
ZKSYNC_SEPOLIA_RPC_URL=
ETHEREUM_SEPOLIA_RPC_URL=
ZK_AGENT_TOKEN_DIRECTORY_ROOT=
ZK_AGENT_STORAGE_DIR=
```

## Existing wallet recovery

If the wallet already exists and approval is missing or expired:

```bash
zk-agent wallet reapprove --name main --await-local
zk-agent next
```

If approval is still present but the local execution signer is missing:

```bash
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
```

Use these inspection commands when the blocker is wallet-specific:

```bash
zk-agent wallet status --name main
zk-agent wallet next --name main
```

If the wallet is already ready and you want the packaged post-flagship entrypoint:

```bash
zk-agent suite
```

## Remote approval

Use the relay-backed path only when the browser is not colocated with the
terminal:

```bash
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

For an existing wallet:

```bash
zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

If the relay is self-hosted through the built-in server:

```bash
zk-agent relay serve --public-origin https://relay.example.com
```

Use `relay inspect` before sending users to a share link. It exposes hosted
readiness, URL shape, persistence mode, and the exact create/reapprove follow-up
path.

For the supported hosted operating contract, use
[`docs/16-hosted-approval-operated-baseline.md`](../../docs/16-hosted-approval-operated-baseline.md).

## Funding and execution

Only fund when the CLI tells you funding is required:

```bash
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Flagship pay path:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent workflow pay --wallet main --to <address> --amount <amount> --broadcast
```

Keep `sed-lite` as the default AA baseline. Use `daily-spend-limit` only when
you intentionally need that narrower policy profile.

## Operator suite

Use:

```bash
zk-agent suite
```

when you want the flagship path plus the current post-flagship surfaces in one
place. This is the intended follow-up surface once `next` or `wallet next`
shows the wallet is already ready.

Use `--wallet <name>` or `--chain <chain>` when the packaged suite contract
should stay on a non-default wallet or chain. The returned commands preserve
that context.

Current suite shape:

- flagship pay:
  `zk-agent workflow pay --wallet main --to <address> --amount <amount>`
- discovery/defaults:
  `zk-agent assets --wallet main`
  `zk-agent defaults`
  `zk-agent resolve-token --chain zksync-sepolia --symbol USDC`
- funding readiness:
  `zk-agent workflow fund --wallet main`
- paymaster readiness:
  `zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode approval-based`
  `zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token`

## Discovery and direct commands

Preferred discovery order:

- `zk-agent assets --wallet main`
- `zk-agent tokens --wallet main --owned`
- `zk-agent defaults`
- `zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>`

Use the direct commands when you intentionally want to bypass the workflow
layer:

- `zk-agent send-token --wallet main --symbol USDC --to <address> --amount <amount>`
- `zk-agent swap --wallet main --token-in-symbol USDC --token-out-symbol ETH --amount-in <amount>`
- `zk-agent fund --wallet main --symbol USDC --amount <amount>`
- `zk-agent deposit --wallet main --symbol USDC --amount <amount>`
- `zk-agent withdraw --wallet main --symbol USDC --amount <amount>`

## Local storage

By default the CLI stores local state under:

```text
~/.zk-agent/
```

Common files:

- `config.json`
- `wallets/*.json`
- `requests/*.json`
- `workflows/*.json`

## Smart-account profiles

The packaged CLI includes built-in profile artifacts for:

- `sed-lite`
- `daily-spend-limit`

Inspect them with:

```bash
zk-agent wallet smart-account profiles --json
```

Use the packaged path for:

```bash
zk-agent wallet smart-account predict --profile sed-lite
zk-agent wallet smart-account deploy --profile sed-lite
```

## Common failures

Connector callback never arrives:

- verify the connector URL saved by `zk-agent setup`
- if local callback is impossible in the current environment, switch to the
  relay-backed path

CLI says the wallet is missing a writable session:

- run `zk-agent doctor --wallet <wallet>`
- inspect `zk-agent wallet status --name <wallet>`
- reapprove when approval is missing
- attach the signer when approval is present but local write readiness is not

Workflow stops on funding:

- do not guess the route
- run the exact `workflow fund` command suggested by the CLI

Locked-down environment blocks local callback or relay binding:

- rerun from a normal host shell
- or use a relay/manual approval path that matches the environment

## Command help

Use:

```bash
zk-agent --help
zk-agent doctor --help
zk-agent wallet --help
zk-agent workflow --help
zk-agent suite --help
```

## License

MIT. See the repository `LICENSE`.
