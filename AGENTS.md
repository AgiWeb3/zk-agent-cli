# AGENTS.md

## Project purpose

This project builds `zk-agent-cli`, an agent-first CLI for `zkSync Era` and `ZK Stack`.

It should preserve the useful architecture patterns from `polygon-agent-cli` while replacing Polygon/Sequence-specific implementations with explicit provider boundaries.

## Technical defaults

- Node.js `>=24`
- `pnpm` workspace
- TypeScript + ESM
- `commander` for the CLI
- `Ink` for TTY terminal UX where useful
- React + Vite for the connector UI

## Package boundaries

- `packages/zk-agent-cli`
  CLI entrypoint, command wiring, UI output
- `packages/zk-connector-ui`
  browser connector UI and relay-facing flow
- `packages/agent-session-protocol`
  session payloads, relay types, crypto helpers
- `packages/agent-core`
  storage, chain registry, token registry interfaces, provider contracts
- `packages/provider-zksync-wallet`
  zkSync wallet/session provider implementation
- `packages/provider-zksync-defi`
  swap/bridge/deposit/withdraw provider implementation
- `packages/agent-tools`
  agent-facing tool wrappers for LLM / framework integration
- `packages/plugin-identity`
  agent identity and reputation plugin surface

## Rules for this project

- Do not reintroduce direct Polygon or Sequence assumptions into CLI commands.
- Put chain/provider specific logic behind interfaces from `agent-core`.
- Keep non-TTY output stable and machine-readable JSON.
- When a feature is not implemented yet, fail explicitly with a milestone-oriented message.
- Only bake in defaults that are verified from local docs in `../zksync-docs/`.
- Avoid turning plugin capabilities into core dependencies.

## Validation

Run the smallest relevant checks after each phase:

- `pnpm zk-agent --help`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
