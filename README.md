# zk-agent-cli

`zk-agent-cli` is a local-first zkSync-native operator toolkit for wallet
approval, workflow execution, hosted relay recovery, and post-flagship
discovery/funding/paymaster guidance.

Current public stage: `0.1.0-rc.5`.

This README is only the repo front door.

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

`zk-agent next` is the product entrypoint. It now compresses the immediate
operator question into one of four categories:

- `bootstrap`
- `recover`
- `operate`
- `workflow`

After the flagship path is live, use `zk-agent suite` as the packaged
post-flagship entrypoint for discovery, defaults, funding, paymaster
readiness, and hosted approval recovery.

The public default story is payment-first: get a ready wallet, send native
value now, stay on the approval-based pay path when fee-token/default state
matters, and recover funding only when the workflow says the write path is
blocked.

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

Use the two surfaces differently:

- `next`: when the CLI still needs to choose the shortest path across setup,
  wallet readiness, recovery, or workflow continuation
- `suite`: when wallet readiness is already clear and you want the packaged
  post-flagship operator catalog
- `suite --include-onboarding`: when you want one readout from first-run
  bootstrap through the packaged operator surface

If readiness is still unclear, use `zk-agent doctor` first. When `doctor`
shows readiness is clear but the question is broader than one immediate next
step, move to `zk-agent suite`.

If you want the full product map from fresh install through wallet bootstrap
and into the packaged operator surface, use:

```bash
zk-agent suite --include-onboarding
```

Inside `suite`, the current operator catalog is organized by the question the
operator is actually asking:

- `operate`: run the flagship native send path
- `discover`: inspect assets/defaults before tokenized actions
- `pay`: stay on the approval-based paymaster path
- `fund`: recover from gas and funding blockers
- `recover`: switch to hosted relay approval when the browser is remote

Those categories currently hand off into three deeper surfaces:

- `workflow`: flagship pay, approval-based pay, and funding recovery
- `discover`: assets/defaults/token inspection
- `relay`: hosted approval recovery

The same surface now also exposes four simpler operator journeys:

- send value now
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

- repo skill bundle for compatible harnesses:

```bash
npx skills add https://github.com/AgiWeb3/zk-agent-cli
```

- source checkout for development or validation:

```bash
pnpm install
pnpm zk-agent --help
```

## Read Next

- packaged CLI operator manual:
  [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)
- shortest verified CLI/harness path:
  [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- native Codex/Codex-plugin wiring:
  [docs/15-codex-plugin-onboarding.md](./docs/15-codex-plugin-onboarding.md)
- hosted remote approval contract:
  [docs/16-hosted-approval-operated-baseline.md](./docs/16-hosted-approval-operated-baseline.md)
- repo reference docs:
  [docs/README.md](./docs/README.md)

Focused product slices live under [skills/](./skills/):
`zk-aa`, `zk-discovery`, `zk-funding`, `zk-paymaster`, `zk-relay`, and
`zk-defi`.

If you are working on the repo itself, start with:

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

Default repo validation:

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
