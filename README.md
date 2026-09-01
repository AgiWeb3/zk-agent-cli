# zk-agent-cli

`zk-agent-cli` is a local-first zkSync-native operator toolkit for wallet
approval, workflow execution, hosted relay recovery, and post-flagship
discovery/funding/paymaster guidance.

Current public stage: `0.1.0-rc.1`.

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

After the flagship path is live, use `zk-agent suite` as the packaged
post-flagship entrypoint for discovery, defaults, funding, and paymaster
readiness.

## Entry Points

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

- CLI operator manual:
  [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)
- shortest harness/operator quickstart:
  [skills/QUICKSTART.md](./skills/QUICKSTART.md)
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
- contributor instructions:
  [AGENTS.md](./AGENTS.md)

## Remote Approval Fallback

When the browser is not colocated with the terminal, keep the same operator
path but replace the local approval step with:

```bash
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

For the current hosted relay operating contract, use
[docs/16-hosted-approval-operated-baseline.md](./docs/16-hosted-approval-operated-baseline.md).

## Development

Default repo validation:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm validate:release
pnpm validate:rc
```

Use the smallest relevant check when the change is narrower than the full
release gate.

## License

MIT.
