# zk-agent-cli

`zk-agent-cli` is a local-first zkSync-native operator toolkit for wallet
approval, workflow execution, hosted relay recovery, and post-flagship
discovery/funding/paymaster guidance.

Current public stage: `0.1.0-rc.2`.

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
