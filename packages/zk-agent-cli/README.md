# zk-agent-cli

`zk-agent-cli` is the packaged terminal CLI for the zk-agent operator path on
zkSync Era and zkSync Sepolia.

This is the canonical CLI operator manual.

Use:

- [`skills/QUICKSTART.md`](../../skills/QUICKSTART.md) for the shortest
  verified path
- [`docs/15-codex-plugin-onboarding.md`](../../docs/15-codex-plugin-onboarding.md)
  for the native Codex plugin/local marketplace path

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

What each step is doing:

- `setup` writes local defaults
- `next` gives the shortest valid follow-up step
- `wallet create --await-local` is the preferred local approval path
- `workflow pay` is the flagship zkSync-native AA native-send path
- `suite` is the packaged surface

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

The `npx skills add ...` path belongs to the repo skill bundle, not the
packaged CLI install surface.

## Defaults

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

## Repair Paths

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

Current supportable product shape on this path:

- one externally reachable public origin
- one relay host with same-host file persistence
- one same-origin share-link + approval UI surface

Do not assume multi-host or load-balanced durability on the current relay
surface.

If the relay is self-hosted through the built-in server:

```bash
zk-agent relay serve --public-origin https://relay.example.com
```

Use `relay inspect` before sending users to a share link. It exposes hosted
readiness, URL shape, persistence mode, and the exact create/reapprove follow-up
path.

For the supported hosted operating contract, use
[`docs/16-hosted-approval-operated-baseline.md`](../../docs/16-hosted-approval-operated-baseline.md).

## After Wallet Ready

Default flagship write path:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent workflow pay --wallet main --to <address> --amount <amount> --broadcast
```

Keep `sed-lite` as the default AA baseline. Use `daily-spend-limit` only when
you intentionally need that narrower policy profile.

Default packaged surface:

```bash
zk-agent suite
```

Use `suite` when the wallet is already ready and you want one packaged surface
for flagship pay, discovery/defaults, funding readiness, and approval-based
paymaster readiness.

Use `--wallet <name>` or `--chain <chain>` when the returned suite commands
should stay on a non-default wallet or chain.

Only fund when the CLI tells you funding is required:

```bash
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Do not guess the route. Use the exact funding command suggested by `next`,
`doctor`, `wallet status`, a blocked workflow, or `suite`.

## Direct Paths

Prefer `suite` first when you want the packaged discovery/defaults/funding/
paymaster surface. Use the commands below only when you intentionally want a
narrower path.

Preferred discovery order:

- `zk-agent assets --wallet main`
- `zk-agent tokens --wallet main --owned`
- `zk-agent defaults`
- `zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>`

Bypass examples:

- `zk-agent send-token --wallet main --symbol USDC --to <address> --amount <amount>`
- `zk-agent swap --wallet main --token-in-symbol USDC --token-out-symbol ETH --amount-in <amount>`
- `zk-agent fund --wallet main --symbol USDC --amount <amount>`
- `zk-agent deposit --wallet main --symbol USDC --amount <amount>`
- `zk-agent withdraw --wallet main --symbol USDC --amount <amount>`

## Smart-account Profiles

Built-in profiles:

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

- connector callback never arrives:
  verify the connector URL saved by `zk-agent setup`; if local callback is not
  viable in the current environment, switch to the relay-backed path
- wallet is missing a writable session:
  run `zk-agent doctor --wallet <wallet>`, then inspect
  `zk-agent wallet status --name <wallet>`; reapprove when approval is missing,
  attach the signer when approval is still present
- workflow stops on funding:
  do not guess the route; run the exact `workflow fund` command suggested by
  the CLI
- locked-down environment blocks local callback or relay binding:
  rerun from a normal host shell or use the relay/manual approval path that
  matches the environment

## Reference

Local storage:

By default the CLI stores local state under:

```text
~/.zk-agent/
```

Common files:

- `config.json`
- `wallets/*.json`
- `requests/*.json`
- `workflows/*.json`

Help surfaces:

```bash
zk-agent --help
zk-agent doctor --help
zk-agent wallet --help
zk-agent workflow --help
zk-agent suite --help
```

## License

MIT. See the repository `LICENSE`.
