# zk-agent-cli

`zk-agent-cli` is a local-first zkSync-native operator toolkit.

It ships three public surfaces:

- a packaged terminal CLI: `zk-agent-cli` / `zk-agent`
- a repo skill bundle for compatible agent harnesses
- a native plugin source under `.codex-plugin/`

The current flagship path is a `sed-lite` smart-account workflow on zkSync
Sepolia:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

## Choose Your Entry Point

Use the packaged CLI for direct terminal/operator work:

```bash
npx zk-agent-cli --help
```

or:

```bash
npm install -g zk-agent-cli
zk-agent --help
```

Use the repo skill bundle when a compatible harness consumes this repository as
an installable skill set:

```bash
npx skills add https://github.com/AgiWeb3/zk-agent-cli
```

Use a source checkout when you are developing or validating the repository
itself:

```bash
pnpm install
pnpm zk-agent --help
```

## Current Product Baseline

- local-first wallet/session lifecycle is implemented
- `setup`, `next`, and `doctor` provide the canonical onboarding path
- hosted relay approval exists for remote-browser approval and reapproval
- `workflow pay` is the flagship zkSync-native AA path
- `suite` packages discovery, defaults, funding, and paymaster readiness after
  the flagship pay flow

The current stage is `rc`: the chain path is real, and the remaining work is
product-shell polish, hosted approval hardening, and release discipline.

## Read In This Order

If you want to use the CLI:

- canonical operator manual:
  [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)
- shortest verified happy path:
  [skills/QUICKSTART.md](./skills/QUICKSTART.md)

If you need a focused surface:

- flagship AA/operator path:
  [skills/zk-aa/SKILL.md](./skills/zk-aa/SKILL.md)
- discovery/defaults:
  [skills/zk-discovery/SKILL.md](./skills/zk-discovery/SKILL.md)
- funding readiness:
  [skills/zk-funding/SKILL.md](./skills/zk-funding/SKILL.md)
- paymaster readiness:
  [skills/zk-paymaster/SKILL.md](./skills/zk-paymaster/SKILL.md)
- hosted relay / remote approval:
  [skills/zk-relay/SKILL.md](./skills/zk-relay/SKILL.md)
- broader DeFi paths:
  [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

If you are working on the repo itself:

- docs index:
  [docs/README.md](./docs/README.md)
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

Default repo checks:

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
