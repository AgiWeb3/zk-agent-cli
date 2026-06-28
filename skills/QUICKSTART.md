# zk-agent-cli Quickstart

This quickstart is intentionally narrow. It describes the shortest verified
operator path for the current phase of the project.

## 1. Install dependencies

From the repository root:

```bash
pnpm install
```

## 2. Initialize local config

```bash
pnpm zk-agent setup
```

Expected result:

- local config is saved under `~/.zk-agent/config.json`
- the CLI prints a `next` command for wallet creation

## 3. Create a writable wallet session

```bash
pnpm zk-agent wallet create --await-local
```

This is the preferred path because the CLI waits for the local connector
callback and stores the approved session immediately.

If a wallet already exists but the writable local session is missing or stale:

```bash
pnpm zk-agent wallet reapprove --name main --await-local
```

Manual fallback when the connector cannot call back into the waiting CLI:

```bash
pnpm zk-agent relay serve
pnpm zk-agent wallet create
pnpm zk-agent wallet request relay-publish --request-id <id> --relay-url <relay-url>
pnpm zk-agent wallet request approve --request-id <id> --relay-url <relay-url> --code <code>
```

Encrypted relay fallback:

```bash
pnpm zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>
```

## 4. Inspect readiness

Inspect the currently tracked validated Sepolia router / paymaster / fee-token
defaults when you need the machine-readable baseline:

```bash
pnpm zk-agent defaults
```

Shortest next-step summary:

```bash
pnpm zk-agent wallet next --name main
```

Full readiness inspection plus the same recommendation:

```bash
pnpm zk-agent wallet status --name main
```

## 5. Fund only if the CLI says funding is required

Guidance only:

```bash
pnpm zk-agent fund --wallet main
```

Dispatch the suggested funding route:

```bash
pnpm zk-agent fund --wallet main --amount <amount> --execute
```

## 6. Run a workflow instead of jumping straight to direct write commands

Preview a native send:

```bash
pnpm zk-agent workflow run --wallet main --intent send-native --to <address> --amount <amount>
```

Broadcast the same send:

```bash
pnpm zk-agent workflow run --wallet main --intent send-native --to <address> --amount <amount> --broadcast
```

The same workflow surface also supports:

- `send-token`
- `call-write`
- `swap`
- `bridge`
- `deposit`
- `withdraw`

If `workflow run|status|resume` is blocked on a missing writable session, add
`--ensure-wallet-session`. Add `--relay-url <url>` when you want the workflow
command to emit relay publish/status/approve follow-up commands instead of only
local callback guidance.

## 7. Resume blocked or long-running flows

List stored checkpoints:

```bash
pnpm zk-agent workflow list
```

Inspect one checkpoint:

```bash
pnpm zk-agent workflow show --request-id <id>
```

Check whether it is ready to continue:

```bash
pnpm zk-agent workflow status --request-id <id>
```

Resume when ready:

```bash
pnpm zk-agent workflow resume --request-id <id> --broadcast
```

## 8. Use direct commands only when you intentionally need them

Examples:

```bash
pnpm zk-agent balances --wallet main
pnpm zk-agent send --wallet main --to <address> --amount <amount>
pnpm zk-agent swap --wallet main --protocol syncswap-classic ...
pnpm zk-agent bridge --wallet main --to-chain zksync-sepolia --amount <amount>
pnpm zk-agent withdraw --wallet main --amount <amount>
pnpm zk-agent withdraw-status --wallet main --tx-hash <hash>
pnpm zk-agent withdraw-finalize --wallet main --tx-hash <hash>
```

## 9. Smart-account path

List built-in profiles:

```bash
pnpm zk-agent wallet smart-account profiles
```

Predict and deploy the primary built-in profile:

```bash
pnpm zk-agent wallet smart-account predict --name main --profile sed-lite
pnpm zk-agent wallet smart-account deploy --name main --profile sed-lite
```

## 10. Programmatic tool surface

List tools:

```bash
pnpm --filter @zk-agent/agent-tools tool:run -- --list
```

Run a tool:

```bash
pnpm --filter @zk-agent/agent-tools tool:run -- --tool walletStatusTool --input '{"walletName":"main"}'
```

## Known constraints

- approval-based paymaster mode is not valid for every ERC-20 fee token
- direct remote approval is available through `relay serve` + `wallet request relay-publish` + `wallet request approve`, including an encrypted relay-package path, but `--await-local` remains the default path
- sandbox DNS can fail even when the public RPC endpoint is healthy
- for current phase work, prefer:
  - `wallet create --await-local`
  - `wallet reapprove --await-local`
  - `wallet next`
  - `wallet status`
  - `workflow run`

For detailed action-path examples, read:

- [zk-defi/SKILL.md](./zk-defi/SKILL.md)
