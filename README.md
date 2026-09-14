# zk-agent-cli

`zk-agent-cli` is a local-first zkSync-native toolkit for wallet
approval, flagship pay execution, hosted relay recovery, and Agent Pay request
routing.

Current public stage: `0.1.0-rc.5`.

This README is only the project front door.

## Why zk-agent-cli

- local-first wallet and session control instead of managed-browser assumptions
- zkSync-native smart-account and paymaster path centered on `sed-lite`
- Agent Pay request capture, queueing, reporting, and approval repair on top
  of the same wallet runtime

## Fastest Path

The current flagship path is a `sed-lite` smart-account workflow on zkSync
Sepolia:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent suite
```

If you are evaluating the product for the first time, stop at the first
successful `zk-agent workflow pay`. Ignore remote approval and Agent Pay until
that baseline path is working once. Use `zk-agent suite` only after that first
success or when the question becomes broader than one immediate write.

`zk-agent next` is the product entrypoint. It now compresses the current
question into one of four categories:

- `bootstrap`
- `recover`
- `operate`
- `workflow`

After the flagship path is live, use `zk-agent suite` as the packaged
post-flagship entrypoint for Agent Pay request work, discovery, defaults,
funding, paymaster readiness, and hosted approval recovery.

The public default story is payment-first: get a ready wallet, send native
value now, stay on the approval-based pay path when fee-token/default state
matters, and recover funding only when the workflow says the write path is
blocked.

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
export without leaving the local-first product surface.

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

Use the public entry surfaces this way:

- `next`: when the CLI still needs to choose the shortest path across setup,
  wallet readiness, recovery, or workflow continuation
- `workflow pay`: when the wallet is ready and you already know you want the
  flagship native-send path now
- `suite`: when wallet readiness is already clear but the question is broader
  than one immediate flagship pay step
- `payment`: when you need a local request, queue, report, or approval-repair
  layer around the write path instead of a direct execution step
- `suite --include-onboarding`: when you want one readout from first-run
  bootstrap through the packaged product surface

If readiness is still unclear, use `zk-agent doctor` first. When `doctor`
shows readiness is clear but the question is broader than one immediate next
step, move to `zk-agent suite`.

If you want the full product map from fresh install through wallet bootstrap
and into the packaged product surface, use:

```bash
zk-agent suite --include-onboarding
```

Inside `suite`, the current product catalog is organized by the question the
user is actually asking:

- `operate`: run the flagship native send path
- `request`: capture, queue, report, export, and repair Agent Pay requests
- `discover`: inspect assets/defaults before tokenized actions
- `pay`: stay on the approval-based paymaster path
- `fund`: recover from gas and funding blockers
- `recover`: switch to hosted relay approval when the browser is remote

Those categories currently hand off into four deeper surfaces:

- `workflow`: flagship pay, approval-based pay, and funding recovery
- `payment`: request capture, queueing, reporting, feed export, and approval repair
- `discovery`: assets/defaults/token inspection
- `relay`: hosted approval recovery

The same surface now also exposes five simpler product journeys:

- send value now
- capture and track payments
- inspect before acting
- unstick a write
- recover remote approval

If you only need one default starting point inside `suite`, start with
`send value now`.

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

- packaged CLI manual:
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
