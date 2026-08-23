# zk-agent-cli

`zk-agent-cli` is a local-first monorepo for a zkSync-native agent CLI on top
of `zkSync Era` and the wider `ZK Stack`.

If you want the full terminal/operator manual, start here:

- [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)

If you want the maintained agent-facing quickstart, use:

- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [skills/SKILL.md](./skills/SKILL.md)
- [skills/zk-aa/SKILL.md](./skills/zk-aa/SKILL.md)
- [skills/zk-relay/SKILL.md](./skills/zk-relay/SKILL.md)
- [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

Project memory for contributors lives here:

- [PROJECT_STATE.md](./PROJECT_STATE.md)
- [PLANS.md](./PLANS.md)
- [AGENTS.md](./AGENTS.md)

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

- the current public beta is `zk-agent-cli@0.1.0-beta.10`
- that release was published on `2026-08-23`
- release validation remains local and explicit through
  `pnpm validate:release`
- the public npm dist-tags are currently aligned:
  `beta -> 0.1.0-beta.10`, `latest -> 0.1.0-beta.10`
- release notes live in [CHANGELOG.md](./CHANGELOG.md) and [docs/releases/0.1.0-beta.10.md](./docs/releases/0.1.0-beta.10.md)
- the next versioned release note can be seeded from git with
  `pnpm release:draft-notes --from <git-ref> [--to <git-ref>] [--apply]`

## Current Status

The core zkSync-native product baseline is already real:

- the public npm package is live and installable
- the local-first wallet/session lifecycle is implemented
- hosted relay approval is proven end to end
- the flagship zkSync-native AA path is `workflow pay` on `sed-lite`
- the maintained skill surface is split into `zk-aa`, `zk-relay`, and
  `zk-defi`

The active work is now productization:

- simplify the public shell and first-run onboarding
- harden hosted approval from a validated prototype toward an operated
  baseline
- reduce release/version/doc drift after publish
- package one clearer zkSync-native product slice after the flagship pay path

Release-stage judgment:

- the project should remain on `beta` today
- `rc` requires a closed hosted-approval operating contract, repeatable release
  flow, and frozen public machine-readable contracts
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

## User-Facing Command Model

From an operator point of view, the CLI keeps one consistent shape:

```bash
zk-agent <top-level-command> [subcommand] [flags]
```

The public surface is intentionally organized around five questions:

1. What should I do next, or is local state unclear?
   Use `zk-agent --help` and `zk-agent next`.
   Use `zk-agent doctor` when you want one local-only diagnosis across config,
   wallet approval, and signer state before dropping into wallet-specific
   commands.
2. Is the wallet/session itself blocked?
   Use `zk-agent wallet --help`, `wallet status`, and `wallet next`.
3. Do I already know the workflow intent?
   Use `zk-agent workflow --help`, with `workflow pay` as the flagship path
   and `workflow auto` as the broader guided path.
4. Do I need stable local operator metadata?
   Use `zk-agent agent ...`.
5. Do I want lower-level primitives instead of the guided workflow layer?
   Use direct commands such as `fund`, `send`, `swap`, `bridge`, `deposit`,
   and `withdraw`.

Discovery is also productized around one local-first path:

- `assets` is the preferred single-chain asset view
- `tokens --wallet <name> --owned` is the narrower ERC-20 holdings view
- `tokens --chain <chain>` and `resolve-token` are the symbol-first discovery
  surfaces
- `tokens --chain <chain> --role paymaster-fee-token` and
  `resolve-token --chain <chain> --symbol <symbol> --role paymaster-fee-token`
  are the approval-based fee-token recovery path when `workflow pay` or another
  paymaster-backed flow needs a canonical candidate set
- `defaults` is the machine-readable registry escape hatch for validated and
  fallback routes, tokens, and paymaster metadata
- `ZK_AGENT_TOKEN_DIRECTORY_ROOT` is the optional broader local token-directory
  input when repo-local deployment metadata is not enough

Direct-command escape hatches still follow that same product contract:

- `send-token`, `fund`, `deposit`, and `withdraw` can resolve symbols locally,
  so explicit token addresses are no longer always required
- `swap` follows the current registry-backed validated path by default and can
  still be narrowed with explicit protocol or symbol-role flags
- `bridge` can reuse the tracked default destination route when the current
  wallet chain has one, so `--to-chain` is no longer always mandatory

Optional local operator identity is a separate layer, not a prerequisite:

- use `zk-agent agent status` to inspect whether a local profile exists
- use `zk-agent agent set --name <name> --wallet main` to save or relink the
  local operator profile
- use `zk-agent agent show` to inspect the saved profile
- wallet approval and workflow execution still work without a saved local
  agent profile

For the maintained long-form references, use:

- [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)
- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
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
