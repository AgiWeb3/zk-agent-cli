# zk-agent-cli Quickstart

This quickstart keeps only the shortest verified default path.
Use the package README when you need the broader CLI surface, flags, or repair
details.
Use the plugin onboarding note only when you intentionally want the native
Codex plugin path instead of the CLI path.

Use the packaged CLI form:

```bash
zk-agent <command>
```

Equivalent entrypoints:

- one-shot: `npx zk-agent-cli <command>`
- source checkout: `pnpm zk-agent <command>`
- public first-touch command: `zk-agent start`

`zk-agent start` is the public onboarding command that keeps the same output
contract as `zk-agent next`. Keep `next` as the canonical operator/runtime
contract in scripts and JSON examples.

## Start here by question

- `start`: you want the shortest obvious first-touch command
- `pay`: the wallet is already ready and you want the first flagship
  product proof now
- `submit`: execution is no longer the whole story and you want one compact
  Agent Pay ingress request now
- `suite`: the wallet is already ready and the question is broader than one
  immediate send
- `payment`: execution is no longer the whole story and you need a durable
  Agent Pay request plus follow-up around the same write path
- `relay baseline`: the browser is remote and approval cannot return directly
  to this terminal

## Defaults

- Node.js `>=24`
- default chain: `zksync-sepolia`
- default local approval callback: `http://localhost:4444`
- `.env` is usually not required for `setup`, `next`, `doctor`, or wallet
  request creation
- live reads and broadcasts usually do require RPC values in `.env`

## 1. Install the surface you need

Terminal CLI:

```bash
npx zk-agent-cli --help
```

Global install:

```bash
npm install -g zk-agent-cli
zk-agent --help
```

Compatible skill-harness install:

```bash
npx skills add https://github.com/AgiWeb3/zk-agent-cli
```

Native local Codex plugin wiring is a separate path:

```bash
pnpm codex:plugin:doctor
pnpm codex:plugin:install-local
```

## 2. Follow the default path

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent pay --wallet main --to <address> --amount <amount>
```

If you want the most obvious first-touch command, start with:

```bash
zk-agent start
```

`zk-agent pay` is the public shortcut for the flagship send path. The scoped
form remains `zk-agent workflow pay`.
`zk-agent submit` is the public shortcut for the compact Agent Pay ingress
path. The scoped form remains `zk-agent payment submit`.

If you are new, stop at the first successful `zk-agent pay`. Ignore
`suite`, `payment`, and `relay` until that baseline path works once, unless
the CLI explicitly points you there. Use `zk-agent suite` only after that
first success or when you want the broader question-first packaged surface.

After that first success, the default broader follow-up is:

```bash
zk-agent suite
```

What each step is doing:

- `setup` writes local defaults
- `next` gives the shortest valid follow-up step and labels the current
  product question as `bootstrap`, `recover`, `operate`, or `workflow`
- `wallet create --await-local` is the preferred local approval path
- `pay` is the flagship zkSync-native public native-send shortcut
- `suite` is the packaged post-flagship entrypoint for discovery, defaults,
  funding, and paymaster readiness

The packaged default story is payment-first: send native value now, stay on
the approval-based pay path when fee-token/default state matters, and recover
funding only when the workflow says the write path is blocked.

The shortest way to think about Agent Pay is:

- `submit`: capture one payment request
- `workspace`: review the cross-request operator surface
- `handoff`: export one stable single-request bundle
- `feed`: export the stable cross-request batch view

Broader operator views remain available through `dashboard`, `queue`,
`report`, and `approval` when the request layer matters more than one
immediate send.

The fastest Agent Pay proof path is:

```bash
zk-agent submit --wallet main --to <address> --amount <amount>
zk-agent payment next --request-id <id>
zk-agent payment approval --request-id <id>
zk-agent workspace
zk-agent payment handoff --request-id <id>
zk-agent payment feed
```

That path shows compact ingress, wallet-aware follow-up, approval readiness,
workspace summary, single-request handoff bundling, and cross-request feed
export without leaving the local-first surface.

If request capture is no longer enough and you need one current cross-request
operator view, open:

```bash
zk-agent workspace
```

That is the current public shortcut to the Agent Pay workbench anchor above
`dashboard`, `queue`, `report`, and `feed`. The scoped form remains
`zk-agent payment workspace`.

Choose between the two Agent Pay-facing surfaces this way:

- `payment`: the packaged question has already narrowed to one request layer
  and its follow-up surface, with `workspace` as the current public
  workbench shortcut
- `suite`: wallet readiness is already clear, but you still want the broader
  packaged catalog across requests, discovery, paymaster, funding, and hosted
  recovery

The three public proof paths today are:

- flagship pay: prove the default ready-wallet zkSync-native send path
- Agent Pay: prove local request capture plus follow-up surfaces around the
  same wallet runtime
- hosted approval recovery: prove remote-browser session recovery on the
  current single-host relay baseline

Choose the surface by question:

- `start`: you are just beginning and want the public onboarding command that
  mirrors `next`
- `next`: the CLI still needs to choose across setup, wallet readiness,
  recovery, or workflow continuation
- `pay`: the wallet is ready and you want the flagship native-send
  path now
- `submit`: execution is no longer the whole story and you want one compact
  Agent Pay ingress request now
- `suite`: wallet readiness is already clear and you want the packaged
  question-first post-flagship product catalog
- `payment`: you need a durable local request plus follow-up, sharing, reporting, export, or
  approval repair around the same write path
- `relay baseline`: the browser is remote and approval must move to the hosted
  fallback path
- `suite --include-onboarding`: you want the full map from first-run bootstrap
  through the packaged product surface

If readiness is unclear before you choose a fix, use:

```bash
zk-agent doctor
```

When `doctor` says local readiness is clear and you want the broader
question-first packaged surface, move to:

```bash
zk-agent suite
```

## 3. Recover an existing wallet

If approval is missing or expired:

```bash
zk-agent wallet reapprove --name main --await-local
zk-agent next
```

If approval is still present but local write readiness is missing:

```bash
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
```

Wallet-specific inspection:

```bash
zk-agent wallet status --name main
zk-agent wallet next --name main
```

## 4. Use remote approval only when needed

When the browser is not colocated with the terminal:

```bash
zk-agent relay baseline --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

For an existing wallet:

```bash
zk-agent relay baseline --relay-url <relay-url>
zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

If you are running the built-in relay:

```bash
zk-agent relay serve --public-origin https://relay.example.com
```

Keep the local `--await-local` path as the default whenever the browser and
terminal can be colocated.

## 5. Use `suite` as the default post-flagship surface

When the wallet is already ready and you want the broader question-first
post-flagship surface in one place:

```bash
zk-agent suite
```

Use `--wallet <name>` or `--chain <chain>` when the returned commands should
stay on a non-default wallet or chain.

That packaged surface currently hands off into four deeper surfaces:

- `workflow`: flagship pay, approval-based pay, and funding recovery
- `payment`: request capture, follow-up, sharing, export, and approval repair
- `discovery`: assets/defaults/token inspection
- `relay`: hosted approval recovery

It also now exposes five simpler product journeys:

- `send value now`
- `capture and track payments`
- `inspect before acting`
- `unstick a write`
- `recover remote approval`

Its smallest question-first entry layer is:

- `send now`
- `track payments`
- `inspect before token action`
- `unstick write`
- `recover remote approval`

For the clearest Agent Pay proof path inside `suite`, follow:

```bash
zk-agent submit --wallet main --to <address> --amount <amount>
zk-agent payment next --request-id <id>
zk-agent payment approval --request-id <id>
zk-agent workspace
zk-agent payment handoff --request-id <id>
zk-agent payment feed
```

That is the shortest packaged route from one local request write into
wallet-aware follow-up, approval readiness, workspace summary, and
integration-ready export.

If you want the narrower discovery/defaults commands directly, prefer:

```bash
zk-agent assets --wallet main
zk-agent defaults
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
```

When you already know the wallet is ready and the need is request tracking
rather than the broader question-first packaged surface, prefer:

```bash
zk-agent submit --wallet main --to <address> --amount <amount>
zk-agent payment queue
zk-agent payment report
zk-agent payment approval --request-id <id>
```

## 6. Fund only when the CLI tells you to

```bash
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Do not guess the route. Use the exact funding command suggested by `next`,
`doctor`, `wallet status`, or the blocked workflow output.

## 7. Use the right deeper guide

- full routing guide: [SKILL.md](./SKILL.md)
- flagship AA path: [zk-aa/SKILL.md](./zk-aa/SKILL.md)
- Agent Pay request layer: [zk-agent-pay/SKILL.md](./zk-agent-pay/SKILL.md)
- discovery/defaults: [zk-discovery/SKILL.md](./zk-discovery/SKILL.md)
- funding readiness: [zk-funding/SKILL.md](./zk-funding/SKILL.md)
- paymaster readiness: [zk-paymaster/SKILL.md](./zk-paymaster/SKILL.md)
- hosted relay / remote approval: [zk-relay/SKILL.md](./zk-relay/SKILL.md)
- broader DeFi paths: [zk-defi/SKILL.md](./zk-defi/SKILL.md)
