# zk-agent-cli Quickstart

This quickstart keeps only the shortest verified operator path.
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

## 2. Follow the default operator path

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
zk-agent suite
```

What each step is doing:

- `setup` writes local defaults
- `next` gives the shortest valid follow-up step
- `wallet create --await-local` is the preferred local approval path
- `workflow pay` is the flagship zkSync-native AA native-send path
- `suite` is the packaged post-flagship entrypoint for discovery, defaults,
  funding, and paymaster readiness

If readiness is unclear before you choose a fix, use:

```bash
zk-agent doctor
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
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent next
```

For an existing wallet:

```bash
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

When the wallet is already ready and you want the packaged post-flagship
surface in one place:

```bash
zk-agent suite
```

Use `--wallet <name>` or `--chain <chain>` when the returned commands should
stay on a non-default wallet or chain.

If you want the narrower discovery/defaults commands directly, prefer:

```bash
zk-agent assets --wallet main
zk-agent defaults
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
```

## 6. Fund only when the CLI tells you to

```bash
zk-agent workflow fund --wallet main
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Do not guess the route. Use the exact funding command suggested by `next`,
`doctor`, `wallet status`, or the blocked workflow output.

## 7. Use the right deeper guide

- full operator guide: [SKILL.md](./SKILL.md)
- flagship AA path: [zk-aa/SKILL.md](./zk-aa/SKILL.md)
- discovery/defaults: [zk-discovery/SKILL.md](./zk-discovery/SKILL.md)
- funding readiness: [zk-funding/SKILL.md](./zk-funding/SKILL.md)
- paymaster readiness: [zk-paymaster/SKILL.md](./zk-paymaster/SKILL.md)
- hosted relay / remote approval: [zk-relay/SKILL.md](./zk-relay/SKILL.md)
- broader DeFi paths: [zk-defi/SKILL.md](./zk-defi/SKILL.md)
