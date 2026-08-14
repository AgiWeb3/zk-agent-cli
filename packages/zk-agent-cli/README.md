# zk-agent-cli

`zk-agent-cli` is the packaged `zk-agent-cli` command surface for zkSync Era
and zkSync Sepolia.

Current strengths:

- local-first wallet/session storage
- `next`-first operator guidance
- relay-backed approval and reapproval
- workflow orchestration for send, swap, bridge, deposit, and withdraw
- machine-readable JSON output for agent callers

## Public Entry Points

Choose the entrypoint that matches the environment.

If you are installing this repository into a compatible agent harness instead
of using the CLI directly, prefer the repo skill surface:

```bash
npx skills add https://github.com/AgiWeb3/zk-agent-cli
```

For direct terminal use, install the packaged CLI:

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

- Node.js `>=24` for either `npx zk-agent-cli ...` or global install.
  Older Node versions may still start the CLI, but the current package is not
  supported there and npm will emit `EBADENGINE` warnings.
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
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

If the browser is not colocated with the terminal, keep the same flow but
replace the wallet-creation step with:

```bash
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

If a wallet already exists, inspect the blocker first. Use `wallet reapprove`
when approval is missing or expired, then return to `zk-agent next`. Use
`wallet signer attach` when approval is still present but the local execution
signer is missing:

```bash
zk-agent wallet reapprove --name main --await-local
zk-agent next
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
```

Only fund when the CLI says funding is actually required:

```bash
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Current flagship AA native-pay path:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent workflow pay --wallet main --to <address> --amount <amount> --paymaster-mode sponsored
```

Use a `sed-lite` wallet for the default AA acceptance path. Keep
`daily-spend-limit` for profile-specific policy experiments, not as the main
operator baseline.

`workflow pay` fixes the workflow intent to `send-native`, persists a
checkpoint, executes immediately when ready, reopens a missing writable session
through the intent-scoped approval path, and defaults to the validated
approval-based paymaster mode unless you override it.
When that approval-based path still needs a fee-token candidate, recover with
`zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token` and
`zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token`.

## Discovery Path

Use the discovery surfaces in this order when a workflow or direct command
needs token context:

- `zk-agent assets --wallet main` for the preferred single-chain asset view
- `zk-agent tokens --wallet main --owned` for the narrower owned ERC-20 subset
- `zk-agent tokens --chain zksync-sepolia` and
  `zk-agent resolve-token --chain zksync-sepolia --symbol USDC` for
  symbol-first discovery before choosing an explicit token address
- `zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token` and
  `zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token`
  for approval-based paymaster fee-token discovery on the flagship pay path
- `zk-agent defaults` for the machine-readable registry/defaults catalog:
  tracked token roles, paymaster metadata, source order, and validated/fallback
  route metadata

## Direct Command Escape Hatches

Use the guided workflow layer first, but the lower-level direct commands now
keep the same symbol/discovery contract:

- `zk-agent send-token --wallet main --symbol USDC --to <address> --amount <amount>`
- `zk-agent swap --wallet main --token-in-symbol USDC --token-out-symbol ETH --amount-in <amount>`
- `zk-agent fund --wallet main --symbol USDC --amount <amount>`
- `zk-agent deposit --wallet main --symbol USDC --amount <amount>`
- `zk-agent withdraw --wallet main --symbol USDC --amount <amount>`

Current direct-command behavior:

- `send-token`, `fund`, `deposit`, and `withdraw` accept symbol-first token
  resolution when the local registry can resolve the active chain token
- `swap` follows the current registry-backed validated route by default when
  `--protocol` is omitted
- `bridge` can reuse the tracked default destination route when one is already
  known for the current wallet chain

## Local Agent Identity

The local operator profile is optional. It helps agent harnesses and operators
persist stable metadata, but wallet approval and workflow execution do not
depend on it.

Use:

- `zk-agent agent status`
- `zk-agent agent set --name "<operator-name>" --wallet main`
- `zk-agent agent show`

## Remote Approval

Shortest relay-backed path in one terminal process:

```bash
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
```

If the wallet already exists and approval metadata needs to be refreshed, use:

```bash
zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code
```

Treat that hosted path as the fallback when the browser is not colocated with
the terminal; keep the local `--await-local` path as the default baseline.

If approval is still present and only the local execution signer is missing,
repair that locally instead of forcing a new approval round-trip:

```bash
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
```

Local relay prototype path:

```bash
zk-agent relay serve --public-origin https://relay.example.com
zk-agent wallet create --relay-url <relay-url>
zk-agent wallet request approve --request-id <id> --relay-url <relay-url> --code <code> --wait
```

The built-in relay is a local file-backed prototype. It is useful for operator
testing, not a production hosted relay service. When it sits behind a tunnel or
reverse proxy, pass `--public-origin` so the emitted share/status URLs point at
the externally reachable hosted URL instead of the local bind address. The
published package now also ships the bundled connector UI build used by
`relay serve`, so hosted share-link approval no longer depends on a separate
source checkout just to serve the UI. `relay inspect` now also reports
`stateBackend`, `deploymentScope`, and `sameHostRestartPersists` so the
single-host local-filesystem constraint is explicit before you rely on a hosted
URL.

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
- `workflows/*.json`

## Smart-Account Profiles

The published package ships built-in profile artifacts for the first-party
smart-account presets:

```bash
zk-agent wallet smart-account profiles --json
```

That means the packaged CLI can use:

- `zk-agent wallet smart-account predict --profile sed-lite`
- `zk-agent wallet smart-account deploy --profile sed-lite`
- the same built-in path for `daily-spend-limit`

Current boundary:

- built-in profiles work from the packaged CLI
- custom profile artifacts still use `--artifact <json|@file>`
- `ZK_AGENT_ACCOUNT_PROFILES_ROOT` is now only a source-checkout override for
  development or custom runtime layouts

## Common Failures

Connector callback never arrives:

- verify the connector URL saved by `zk-agent setup`
- if local callback is not possible in your environment, switch to the relay
  path with `zk-agent relay serve` plus `wallet create|reapprove --relay-url`

CLI says the wallet is missing a writable session:

- inspect `zk-agent wallet status --name <wallet>`
- if approval is missing, run `zk-agent wallet reapprove --name <wallet> --await-local`
- if approval is present but the local signer is missing, run
  `zk-agent wallet signer attach --name <wallet> --private-key <hex>`
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
