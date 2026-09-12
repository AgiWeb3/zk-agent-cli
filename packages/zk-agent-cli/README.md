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
- `next` gives the shortest valid follow-up step and now labels the current
  product question as `bootstrap`, `recover`, `operate`, or `workflow`
- `wallet create --await-local` is the preferred local approval path
- `workflow pay` is the flagship zkSync-native AA native-send path
- `suite` is the packaged surface

The packaged default story is payment-first: send native value now, stay on
the approval-based pay path when fee-token/default state matters, and recover
funding only when the workflow says the write path is blocked.

The first Agent Pay platform primitive now exists as a local-first payment
ingress, request, routing, and approval-orchestration surface:

```bash
zk-agent payment submit --wallet main --to <address> --amount <amount>
zk-agent payment queue
zk-agent payment report
zk-agent payment approval --request-id <id>
zk-agent payment sync-approval --request-id <id>
zk-agent payment create --wallet main --to <address> --amount <amount>
zk-agent payment next --request-id <id>
zk-agent payment inspect --request-id <id>
zk-agent payment intent --request-id <id>
zk-agent payment describe --request-id <id>
zk-agent payment execution --request-id <id>
zk-agent payment quote --request-id <id>
zk-agent payment refresh-quote --request-id <id>
zk-agent payment settlement --request-id <id>
zk-agent payment reconcile --request-id <id> --status <status>
zk-agent payment list
```

If readiness is unclear before you choose a fix, use:

```bash
zk-agent doctor
```

When `doctor` shows local readiness is clear and the question is broader than
one immediate next step, move to:

```bash
zk-agent suite
```

If you want one packaged readout that includes both first-run onboarding and
the post-flagship operator surface, use:

```bash
zk-agent suite --include-onboarding
```

Use the surfaces this way:

- `next`: the CLI is still deciding the shortest path across setup, wallet
  readiness, recovery, or workflow continuation
- `suite`: the wallet is already ready and you want the packaged operator
  catalog after the flagship pay path
- `suite --include-onboarding`: you want one combined readout from first-run
  bootstrap through the packaged post-flagship surface

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

## Choose the right surface

- `zk-agent next`: the top-level product entrypoint when the CLI still needs to
  choose the shortest path
- `zk-agent doctor`: local-only diagnosis before you choose a fix
- `zk-agent wallet status --name <wallet>` and
  `zk-agent wallet next --name <wallet>`: wallet-scoped repair and readiness
- `zk-agent workflow ...`: explicit workflow planning, persistence, status, and
  resume questions
- `zk-agent payment ...`: local-first payment ingress, request capture, routing,
  and settlement-state tracking for the Agent Pay platform layer
- `zk-agent suite`: the packaged post-flagship catalog once wallet readiness is
  no longer the blocker

## Repair locally first

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

## Switch to remote approval only when needed

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

## After the wallet is ready

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
for flagship pay, discovery/defaults, funding readiness, approval-based
paymaster readiness, and hosted approval recovery.

Current `suite` catalog categories:

- `operate`
- `discover`
- `pay`
- `fund`
- `recover`

Current `suite` handoff surfaces:

- `workflow`: flagship pay, approval-based pay, and funding recovery
- `discovery`: assets/defaults/token inspection
- `relay`: hosted approval recovery

Current `suite` operator journeys:

- `send value now`
- `inspect before acting`
- `unstick a write`
- `recover remote approval`

If you only need one default starting point inside `suite`, start with
`send value now`.

Use `--wallet <name>` or `--chain <chain>` when the returned suite commands
should stay on a non-default wallet or chain.

Only fund when the CLI tells you funding is required:

```bash
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Do not guess the route. Use the exact funding command suggested by `next`,
`doctor`, `wallet status`, a blocked workflow, or `suite`.

## Leave the default path only on purpose

Prefer `suite` first when you want the packaged discovery/defaults/funding/
paymaster surface. Drop to lower-level commands only when the question is
already narrower than the packaged catalog.

Preferred discovery order:

- `zk-agent assets --wallet main`
- `zk-agent tokens --wallet main --owned`
- `zk-agent defaults`
- `zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>`

- direct token transfer or send path:
  `zk-agent send-token --wallet main --symbol USDC --to <address> --amount <amount>`
- explicit workflow planning, swap, bridge, deposit, withdraw, or resume:
  `zk-agent workflow --help`
- wallet lifecycle, recovery, approval requests, signer management, or
  smart-account profile operations:
  `zk-agent wallet --help`
- hosted relay inspection or built-in relay serving:
  `zk-agent relay --help`

Built-in smart-account profiles remain:

- `sed-lite`
- `daily-spend-limit`

Keep `sed-lite` as the default product baseline. Use
`zk-agent wallet smart-account --help` when the task is specifically about
predict, deploy, or profile-level self-calls rather than the normal operator
path.

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
zk-agent relay --help
```

## License

MIT. See the repository `LICENSE`.
