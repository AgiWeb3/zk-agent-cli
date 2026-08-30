# zk-agent-cli

`zk-agent-cli` is a local-first monorepo for a zkSync-native agent CLI on top
of `zkSync Era` and the wider `ZK Stack`.

## Start Here

- terminal/operator manual:
  [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)
- maintained agent-facing quickstart:
  [skills/QUICKSTART.md](./skills/QUICKSTART.md),
  [skills/SKILL.md](./skills/SKILL.md),
  [skills/zk-aa/SKILL.md](./skills/zk-aa/SKILL.md),
  [skills/zk-discovery/SKILL.md](./skills/zk-discovery/SKILL.md),
  [skills/zk-funding/SKILL.md](./skills/zk-funding/SKILL.md),
  [skills/zk-paymaster/SKILL.md](./skills/zk-paymaster/SKILL.md),
  [skills/zk-relay/SKILL.md](./skills/zk-relay/SKILL.md),
  [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)
- contributor/project memory:
  [PROJECT_STATE.md](./PROJECT_STATE.md),
  [PLANS.md](./PLANS.md),
  [AGENTS.md](./AGENTS.md)

## Public Entry Points

Choose the entrypoint that matches the environment.

- agent-harness install for compatible runtimes:
  `npx skills add https://github.com/AgiWeb3/zk-agent-cli`
- native Codex/ChatGPT plugin source in this repository:
  `.codex-plugin/plugin.json` and `skills/`
- packaged CLI for terminal/operator use:
  `npx zk-agent-cli --help`
- packaged CLI global install:
  `npm install -g zk-agent-cli`
- packaged binaries after global install:
  `zk-agent --help` and `zksync-agent --help`
- source checkout for contributors:
  `pnpm install` and `pnpm zk-agent --help`

Use the packaged CLI when the operator wants a direct terminal tool. Use the
repo skill install when a compatible harness is consuming this repository as a
skill bundle. Treat `.codex-plugin/plugin.json` as the native plugin source for
products that expect a plugin tree rather than an npm tarball.

Release snapshot:

- the current release candidate cut is `zk-agent-cli@0.1.0-rc.0`
- that RC cut is prepared for the `2026-08-30` release submission
- release validation remains local and explicit through
  `pnpm validate:release`
- the machine-checkable `beta -> rc` subset is now collected under
  `pnpm validate:rc`
- the explicit repo-tracked `beta -> rc` review artifact can now be generated
  with `pnpm review:rc -- --wallet <name> --relay-url <url> --write`
- the public npm dist-tags are currently aligned:
  `beta -> 0.1.0-beta.11`, `rc -> 0.1.0-rc.0`, `latest -> 0.1.0-rc.0`
- release notes live in [CHANGELOG.md](./CHANGELOG.md) and [docs/releases/0.1.0-rc.0.md](./docs/releases/0.1.0-rc.0.md)
- the next version bump plus release-note draft refresh can be prepared with
  `pnpm release:prepare --version <version> --from <git-ref> [--date <YYYY-MM-DD>]`

## Current Status

The core zkSync-native product baseline is already real:

- the public npm package is live and installable
- the local-first wallet/session lifecycle is implemented
- hosted relay approval is proven end to end
- the flagship zkSync-native AA path is `workflow pay` on `sed-lite`
- the maintained skill surface is split into `zk-aa`, `zk-discovery`,
  `zk-funding`, `zk-paymaster`, `zk-relay`, and `zk-defi`
- the root README is intentionally the front door; the package README is the
  canonical operator manual

The active work is now productization:

- simplify the public shell and first-run onboarding
- harden hosted approval from a validated prototype toward an operated
  baseline
- reduce release/version/doc drift after publish
- keep discovery/defaults, funding readiness, and paymaster readiness explicit
  as bounded post-flagship product slices while closing the remaining shell,
  hosted, and release gaps

Release-stage judgment:

- the project is ready to move from `beta` to `rc`
- `0.1.0-rc.0` should be treated as a release candidate, not as `1.0.0`
- `pnpm validate:rc` now closes the machine-checkable `beta -> rc` gate, and
  `pnpm review:rc` records that decision as a repo-tracked artifact
- `1.0.0` still requires repeated RC release validation with no known
  release-blocking issue on packaged install, hosted approval, or flagship
  `workflow pay`
- see [docs/11-npm-release-gate.md](./docs/11-npm-release-gate.md) and
  [docs/16-hosted-approval-operated-baseline.md](./docs/16-hosted-approval-operated-baseline.md)

## Recommended Operator Path

The canonical terminal path is:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

Current validated first-run baseline:

- `setup` defaults to `zksync-sepolia`
- the local approval path expects the connector UI at `http://localhost:4444`
- override those defaults only when you intentionally target another chain or
  connector deployment

If local config or wallet readiness is unclear before you choose a fork, run
`zk-agent doctor`; it inspects saved config, wallet approval metadata, and
local signer state without live RPC reads.

Use `wallet status` and `wallet next` when the question is specifically about
one stored wallet. Use `workflow pay` as the default guided surface for the
flagship native-send path, and keep `workflow auto` for broader guided intent
execution.

If the browser is not colocated with the terminal, keep the same operator path
but replace the wallet-approval step with:

```bash
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

For the full operator manual, recovery flows, and direct-command examples, use
[packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md).

## Focused References

Use the package manual for the full terminal/operator path:

- [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)

Use the quickstart when you only want the shortest verified happy path:

- [skills/QUICKSTART.md](./skills/QUICKSTART.md)

Use focused skills when the question is narrower than the full operator path:

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
- broader DeFi action paths:
  [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

Use the JSON contract doc when a wrapper or harness depends on field-level
stability:

- [docs/10-operator-json-contract.md](./docs/10-operator-json-contract.md)

## Agent Skills

This repository ships both a repo-skill surface and a native plugin source.

- direct repo skill install:
  `npx skills add https://github.com/AgiWeb3/zk-agent-cli`
- native plugin source:
  `.codex-plugin/plugin.json`
- skill references:
  [skills/SKILL.md](./skills/SKILL.md),
  [skills/QUICKSTART.md](./skills/QUICKSTART.md),
  [skills/zk-aa/SKILL.md](./skills/zk-aa/SKILL.md),
  [skills/zk-discovery/SKILL.md](./skills/zk-discovery/SKILL.md),
  [skills/zk-funding/SKILL.md](./skills/zk-funding/SKILL.md),
  [skills/zk-paymaster/SKILL.md](./skills/zk-paymaster/SKILL.md),
  [skills/zk-relay/SKILL.md](./skills/zk-relay/SKILL.md),
  [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

For local Codex plugin onboarding from this repository, use
`pnpm codex:plugin:doctor` and `pnpm codex:plugin:install-local`. Detailed
notes live in
[docs/15-codex-plugin-onboarding.md](./docs/15-codex-plugin-onboarding.md).

## Development

Default contributor commands:

```bash
pnpm install
pnpm zk-agent --help
pnpm typecheck
pnpm test
pnpm build
pnpm release:check
pnpm validate:release
pnpm validate:rc
```

Workspace shape:

```text
zk-agent-cli/
├─ packages/
│  ├─ account-profiles/
│  ├─ agent-core/
│  ├─ agent-session-protocol/
│  ├─ agent-tools/
│  ├─ paymaster-test-assets/
│  ├─ plugin-identity/
│  ├─ provider-zksync-defi/
│  ├─ provider-zksync-wallet/
│  ├─ zk-agent-cli/
│  └─ zk-connector-ui/
├─ docs/
├─ skills/
├─ AGENTS.md
├─ PLANS.md
├─ PROJECT_STATE.md
└─ package.json
```

Use `zkSync Sepolia` as the default development target. Treat broader local
`ZK Stack` environment work as explicit follow-up, not the default inner loop.

## License

MIT.
