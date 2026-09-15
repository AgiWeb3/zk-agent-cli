# zk-agent-cli

`zk-agent-cli` is the packaged terminal CLI for the default zk-agent product path on
zkSync Era and zkSync Sepolia.

This is the canonical CLI manual.

## Why This CLI Exists

- keep wallet and session control local-first
- keep the default execution story zkSync-native and `sed-lite`-first
- add an Agent Pay request layer above direct workflow execution

Use:

- [`skills/QUICKSTART.md`](../../skills/QUICKSTART.md) for the shortest
  verified path
- [`docs/15-codex-plugin-onboarding.md`](../../docs/15-codex-plugin-onboarding.md)
  for the native Codex plugin install path

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

`zk-agent start` is the public onboarding command that keeps the same output
contract as `zk-agent next`. Use `start` when you want the shortest obvious
first-touch command. Keep `next` as the canonical operator/runtime contract in
scripts and JSON examples.

If you are new, stop at the first successful `zk-agent workflow pay`. Ignore
remote approval and Agent Pay until that baseline path works once. Use
`zk-agent suite` only after that first success or when you want the broader
question-first packaged surface.

What each step is doing:

- `setup` writes local defaults
- `next` gives the shortest valid follow-up step and now labels the current
  product question as `bootstrap`, `recover`, `operate`, or `workflow`
- `wallet create --await-local` is the preferred local approval path
- `workflow pay` is the flagship zkSync-native AA native-send path
- `suite` is the broader question-first packaged surface

The packaged default story is payment-first: send native value now, stay on
the approval-based pay path when fee-token/default state matters, and recover
funding only when the workflow says the write path is blocked.

The three public proof paths today are:

- flagship pay: prove the default ready-wallet zkSync-native send path
- Agent Pay: prove local request capture plus follow-up surfaces around the
  same wallet runtime
- hosted approval recovery: prove remote-browser session recovery on the
  current single-host relay baseline

The fastest flagship proof path after wallet readiness is:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent workflow next --request-id <id>
zk-agent workflow status --request-id <id>
```

That path proves the default ready-wallet execution route plus checkpoint
follow-up and status inspection without leaving the flagship workflow surface.

The current local-first Agent Pay entry surface is:

```bash
zk-agent payment submit --wallet main --to <address> --amount <amount>
zk-agent payment dashboard
zk-agent payment feed
zk-agent payment queue
zk-agent payment report
zk-agent payment approval --request-id <id>
```

The fastest Agent Pay proof path is:

```bash
zk-agent payment submit --wallet main --to <address> --amount <amount>
zk-agent payment next --request-id <id>
zk-agent payment approval --request-id <id>
zk-agent payment dashboard
zk-agent payment handoff --request-id <id>
zk-agent payment feed
```

That path shows compact ingress, wallet-aware follow-up, approval readiness,
dashboard summary, single-request handoff bundling, and cross-request feed
export without leaving the local-first surface.

When the browser is remote, the fastest hosted approval proof path on the
current supported recovery baseline is:

```bash
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code
zk-agent wallet status --name main
```

That path proves outside-in relay readiness, one hosted reapproval, and the
post-approval wallet-readiness readout without claiming multi-host durability.

If the wallet does not exist yet, swap `wallet reapprove` for:

```bash
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

Use those commands for the public "start here" path:

- `submit`: capture one payment request through the compact ingress surface
- `dashboard`: review one cross-request dashboard summary above wallet groups,
  actionable queue items, and recent payment activity
- `feed`: expose an integration-ready cross-request batch feed for external
  dashboards, agents, or backend ingestion
- `queue`: review the current actionable request queue
- `report`: summarize cross-request state and next-action distribution
- `approval`: inspect whether the linked wallet is still blocking execution

When you already have a request id and need the deeper local lifecycle,
integration-ready handoff bundle, request parties model, share-safe request
view, routing, quote, settlement, or reconciliation views, use:

```bash
zk-agent payment --help
```

Use `zk-agent payment share --request-id <id>` when the request must be shared
with a payee or external reviewer without exposing local wallet linkage or
execution-preference details.

Use `zk-agent payment parties --request-id <id>` when an external agent or
backend needs the stable request parties model with separate local and
share-safe payer projections.

Use `zk-agent payment handoff --request-id <id>` when an external dashboard,
agent, or backend needs one stable integration bundle instead of
reassembling local reads.

Use `zk-agent payment feed` when that same external surface needs the stable
cross-request batch feed instead of one request at a time.

If readiness is unclear before you choose a fix, use:

```bash
zk-agent doctor
```

When `doctor` shows local readiness is clear and you want the broader
question-first packaged surface, move to:

```bash
zk-agent suite
```

If you want one packaged readout that includes both first-run onboarding and
the post-flagship packaged surface, use:

```bash
zk-agent suite --include-onboarding
```

Inside `suite`, the smallest question-first entry layer is:

- `send now`
- `track payments`
- `inspect before token action`
- `unstick write`
- `recover remote approval`

Use the surfaces this way:

- `start`: you are just beginning and want the public onboarding command that
  mirrors `next`
- `next`: the CLI is still deciding the shortest path across setup, wallet
  readiness, recovery, or workflow continuation
- `workflow pay`: the wallet is already ready and you want the flagship
  native-send path now
- `suite`: the wallet is already ready and you want the broader question-first
  packaged surface because the task is broader than one immediate flagship pay
  step
- `payment`: the execution path is no longer the whole story and you need
  local request capture, queueing, reporting, or approval tracking around it
- `suite --include-onboarding`: you want one combined readout from first-run
  bootstrap through the packaged post-flagship surface

The remote relay path is a fallback, not part of the default happy path. Only
open it when the browser is on another machine or cannot return directly to
the waiting terminal.

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

The `npx skills add ...` path belongs to the skill bundle, not the
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
- `zk-agent workflow pay ...`: the direct flagship execution surface when you
  already know the wallet is ready and the goal is "send value now"
- `zk-agent suite`: the packaged post-flagship catalog once wallet readiness is
  no longer the blocker and you want the broader question-first packaged
  surface
- `zk-agent doctor`: local-only diagnosis before you choose a fix
- `zk-agent wallet status --name <wallet>` and
  `zk-agent wallet next --name <wallet>`: wallet-scoped repair and readiness
- `zk-agent workflow ...`: explicit workflow planning, persistence, status,
  resume questions, and the flagship pay execution path
- `zk-agent payment ...`: local-first payment ingress, request capture, routing,
  queueing, approval tracking, and settlement-state tracking for the Agent Pay
  platform layer

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
for flagship pay, Agent Pay request work, discovery/defaults, funding
readiness, approval-based paymaster readiness, and hosted approval recovery.

Current `suite` catalog categories:

- `operate`
- `request`
- `discover`
- `pay`
- `fund`
- `recover`

Current `suite` handoff surfaces:

- `workflow`: flagship pay, approval-based pay, and funding recovery
- `payment`: request capture, queueing, reporting, feed export, and approval repair
- `discovery`: assets/defaults/token inspection
- `relay`: hosted approval recovery

Current `suite` product journeys:

- `send value now`
- `capture and track payments`
- `inspect before acting`
- `unstick a write`
- `recover remote approval`

If you only need one default starting point inside `suite`, start with
`send value now`.

For the clearest Agent Pay proof path inside `suite`, follow:

```bash
zk-agent payment submit --wallet main --to <address> --amount <amount>
zk-agent payment next --request-id <id>
zk-agent payment approval --request-id <id>
zk-agent payment dashboard
zk-agent payment handoff --request-id <id>
zk-agent payment feed
```

That is the shortest packaged route from one local request write into
wallet-aware follow-up, approval readiness, dashboard summary, and
integration-ready export.

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

Prefer `suite` first when you want the packaged Agent Pay/discovery/funding/
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
predict, deploy, or profile-level self-calls rather than the normal default
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
  rerun from a normal shell or use the relay/manual approval path that
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

MIT. See the project `LICENSE`.
