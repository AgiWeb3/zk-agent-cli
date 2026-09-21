# zk-agent-cli

`zk-agent-cli` is a local-first zkSync-native toolkit for wallet
approval, flagship pay execution, hosted relay recovery, and Agent Pay request
routing.

Current public stage: `0.1.0-rc.8`.

This README is only the project front door.

## Why zk-agent-cli

- local-first wallet and session control instead of managed-browser assumptions
- zkSync-native smart-account and paymaster path centered on `sed-lite`
- Agent Pay request capture and follow-up surface around the same wallet
  runtime

## What Makes It Different

- local-first by default, with hosted approval only as a fallback path when
  the browser is remote
- one zkSync-native operator path from wallet readiness to paymaster-aware
  execution
- one Agent Pay layer that stays attached to the same wallet runtime instead
  of splitting into a separate product

## Fastest Path

The current flagship path is a `sed-lite` smart-account workflow on zkSync
Sepolia:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent pay --wallet main --to <address> --amount <amount>
```

`zk-agent start` is the public onboarding command that keeps the same output
contract as `zk-agent next`. Use `start` when you want the shortest obvious
first-touch command. Keep `next` as the canonical operator/runtime contract in
scripts and JSON examples.

`zk-agent pay` is the public shortcut for the flagship send path. The scoped
form remains `zk-agent workflow pay`.
`zk-agent submit` is the public shortcut for the compact Agent Pay ingress
path. The scoped form remains `zk-agent payment submit`.

If you are evaluating the product for the first time, stop at the first
successful `zk-agent pay`. Ignore `suite`, `payment`, and `relay`
until that baseline path is working once, unless the CLI explicitly points you
there. Use `zk-agent suite` only after that first success or when you want the
broader question-first packaged surface.

If readiness is still unclear, use `zk-agent doctor` first. When `doctor`
shows readiness is clear and you want the broader question-first packaged
surface, move to `zk-agent suite`.

After that first success, the default broader follow-up is:

```bash
zk-agent suite
```

The smallest question-first `suite` entry layer is:

- `send now`
- `track payments`
- `inspect before token action`
- `unstick write`
- `recover remote approval`

The public default story is payment-first: get a ready wallet, send native
value now, stay on the approval-based pay path when fee-token/default state
matters, and recover funding only when the workflow says the write path is
blocked.

## Start Here by Question

- `zk-agent start`: first touch when you want one obvious public entrypoint
- `zk-agent next`: same path, but keep this as the canonical live
  operator/runtime contract
- `zk-agent doctor`: local state is unclear and you need diagnosis before
  choosing a fix
- `zk-agent wallet status --name <wallet>`: the blocker is already clearly
  wallet-scoped
- `zk-agent pay --wallet main --to <address> --amount <amount>`: wallet
  readiness is already clear and you want the flagship proof path now
- `zk-agent workflow ...`: the question is already explicitly workflow-scoped
- `zk-agent payment ...`: execution is no longer the whole story and you need
  the Agent Pay request layer
- `zk-agent workspace`: you already know the question is the current Agent Pay
  workbench
- `zk-agent suite`: wallet readiness is clear and the question is broader than
  one immediate send
- `zk-agent relay baseline --relay-url <relay-url>`: the browser is remote and
  approval must move to the hosted fallback path

## Public Proof Paths

The three public proof paths today are:

- flagship pay: prove the default ready-wallet zkSync-native send path
- Agent Pay: prove local request capture plus follow-up surfaces around the
  same wallet runtime
- hosted approval recovery: prove remote-browser session recovery on the
  current single-host relay baseline

The fastest flagship proof path after wallet readiness is:

```bash
zk-agent pay --wallet main --to <address> --amount <amount>
zk-agent workflow next --request-id <id>
zk-agent workflow status --request-id <id>
```

The fastest Agent Pay proof path is:

```bash
zk-agent submit --wallet main --to <address> --amount <amount>
zk-agent payment next --request-id <id>
zk-agent payment approval --request-id <id>
zk-agent workspace
zk-agent payment handoff --request-id <id>
zk-agent payment feed
```

If request capture is no longer enough and you need one current cross-request
operator view, open the workbench directly:

```bash
zk-agent workspace
```

That is the current public shortcut to the Agent Pay workbench anchor above
dashboard, queue, report, and feed. The scoped form remains
`zk-agent payment workspace`.

When the browser is remote, the fastest hosted approval proof path on the
current supported recovery baseline is:

```bash
zk-agent relay baseline --relay-url <relay-url>
zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code
zk-agent wallet status --name main
```

That path proves outside-in relay readiness, one hosted reapproval, and the
post-approval wallet-readiness readout without pretending the relay is a
multi-host service.

If the wallet does not exist yet, swap `wallet reapprove` for:

```bash
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

For the broader packaged surface after that first success, use
`zk-agent suite`.

## Use It From

- packaged CLI:

```bash
npx zk-agent-cli --help
npm install -g zk-agent-cli
zk-agent --help
```

- skill bundle for compatible installs:

```bash
npx skills add https://github.com/AgiWeb3/zk-agent-cli
```

- source checkout for development or validation:

```bash
pnpm install
pnpm zk-agent --help
```

The remote-approval surface is a fallback, not the first thing a new user
needs to learn. Only open the relay path when the browser is on another
machine or cannot return directly to the waiting terminal.

## Read Next

- full CLI manual:
  [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)
- shortest verified CLI/skill path:
  [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- native Codex/Codex-plugin wiring:
  [docs/15-codex-plugin-onboarding.md](./docs/15-codex-plugin-onboarding.md)
- hosted remote approval contract:
  [docs/16-hosted-approval-operated-baseline.md](./docs/16-hosted-approval-operated-baseline.md)
- reference docs:
  [docs/README.md](./docs/README.md)

Focused product slices live under [skills/](./skills/):
`zk-aa`, `zk-agent-pay`, `zk-discovery`, `zk-funding`, `zk-paymaster`,
`zk-relay`, and `zk-defi`.

If you are working on the codebase itself, start with:

- current plan:
  [PLANS.md](./PLANS.md)
- current project snapshot:
  [PROJECT_STATE.md](./PROJECT_STATE.md)
- release cut runbook:
  [docs/17-release-checklist.md](./docs/17-release-checklist.md)
- contributor instructions:
  [AGENTS.md](./AGENTS.md)

Hosted remote approval is documented in:

- [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)
- [docs/16-hosted-approval-operated-baseline.md](./docs/16-hosted-approval-operated-baseline.md)

## Development

Default project validation:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm release:checklist
pnpm validate:release
pnpm validate:rc
```

Use the smallest relevant check when the change is narrower than the full
release gate.

## License

MIT.
