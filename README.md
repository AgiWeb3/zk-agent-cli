# zk-agent-cli

`zk-agent-cli` is a local-first monorepo for building an agent-oriented CLI on top of `zkSync Era` and the wider `ZK Stack`.

Core references:

- [PROJECT_STATE.md](./PROJECT_STATE.md)
- [PLANS.md](./PLANS.md)

Agent-facing references:

- [skills/SKILL.md](./skills/SKILL.md)
- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [skills/zk-aa/SKILL.md](./skills/zk-aa/SKILL.md)
- [skills/zk-relay/SKILL.md](./skills/zk-relay/SKILL.md)
- [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

The project is intentionally modeled after the real architecture of `polygon-agent-cli`, but it is not a direct fork. The goal is to preserve the reusable system shape:

- CLI entrypoint for humans and agent harnesses
- browser connector UI for session approval
- shared protocol package for session payloads, relay messages, and crypto
- core package for storage, chain registry, and provider interfaces
- provider packages for zkSync-specific wallet and DeFi capabilities
- agent tool adapters for LLM / framework integration

## Public Entry Points

There are now three explicit public entry points:

- agent-harness skill install for compatible runtimes:
  - `npx skills add https://github.com/AgiWeb3/zk-agent-cli`
- packaged CLI for public/operator use:
  - `npx zk-agent-cli --help`
  - `npm install -g zk-agent-cli`
  - binaries: `zk-agent`, `zksync-agent`
- repo-local development and contributor smoke work:
  - `pnpm install`
  - `pnpm zk-agent --help`

Use the skill install when the operator is adding this repo to a compatible
agent harness. Use the packaged CLI when the operator wants a direct terminal
tool. Keep the repo-local wrapper for contributors and source-checkout smoke
work only.

Release snapshot:

- the current public beta, `zk-agent-cli@0.1.0-beta.7`, was published on
  `2026-08-10`
- the local workspace is now continuing post-publish iteration on top of the
  `zk-agent-cli@0.1.0-beta.7` baseline
- release validation remains local and explicit through
  `pnpm validate:release`
- the public npm dist-tags are currently aligned:
  `beta -> 0.1.0-beta.7`, `latest -> 0.1.0-beta.7`
- public agent-harness docs now default to
  `npx skills add https://github.com/AgiWeb3/zk-agent-cli`
- public operator docs now default to the packaged `zk-agent ...` surface
- inside this repository, `pnpm zk-agent ...` remains the development/runtime
  wrapper for contributors and local smoke work

## Current Status

The product baseline is already in place:

- the public npm package is live and installable
- the local-first wallet/session lifecycle is implemented
- hosted relay approval is proven end to end
- the flagship zkSync-native AA path is `workflow pay` on `sed-lite`
- the agent-facing docs are split into stable skill slices:
  `zk-aa`, `zk-relay`, and `zk-defi`

The active work is now productization closeout rather than new protocol
scaffolding:

- unify public install and onboarding entrypoints
- harden the hosted relay from a validated prototype toward a clearer operated
  contract
- reduce release/version/doc drift after publish
- improve token/asset discovery around the current validated Sepolia paths

## Implemented Surface

- monorepo boundaries are in place:
  - CLI package
  - connector UI
  - shared session / relay protocol
  - core storage and registry layer
  - zkSync wallet and DeFi providers
  - built-in account profiles in `packages/account-profiles`
- the operator baseline is real:
  - `setup -> next -> wallet create|reapprove -> next -> workflow pay`
  - wallet-specific recovery through `wallet status`, `wallet next`, and
    `wallet signer attach`
  - workflow-specific recovery through checkpointed `workflow status|next|resume`
- local-first wallet/session lifecycle is implemented:
  - local callback path through `--await-local`
  - hosted/manual recovery path through `--relay-url`
  - `wallet sync`
  - `wallet export|restore`
  - policy-scoped reapproval through session presets and allowlists
- hosted relay approval is shipped as a product surface:
  - `relay inspect`
  - `relay serve`
  - share-link approval flow
  - packaged connector UI bundled into the published CLI
- the flagship workflow layer is in place:
  - `workflow pay` as the default native-send path
  - `workflow auto|plan|run|fund`
  - local checkpoint lifecycle through `workflow start|list|show|update|delete`
- discovery and defaults surfaces are in place:
  - `defaults`
  - `assets`
  - `balances`
  - `tokens`
  - `resolve-token`
  - registry-backed route, token, and paymaster metadata in both TTY and JSON
- execution surfaces are in place for the validated zkSync Sepolia path:
  - `send`
  - `send-token`
  - `call`
  - `swap`
  - `bridge`
  - `deposit`
  - `withdraw`
  - `withdraw-finalize`
- smart-account and paymaster support is in place:
  - `sed-lite` is the primary AA baseline
  - `daily-spend-limit` remains available for narrower policy coverage
  - approval-based and sponsored paymaster defaults are surfaced through the
    registry-backed Sepolia baseline
- agent-facing surfaces are real, not just prose:
  - local operator identity through `agent status|show|set|export|import|clear`
  - `packages/agent-tools` wrappers for wallet, workflow, asset, and approval
    flows
  - smoke scripts for operator path, hosted relay, remote approval, flagship
    workflow, and discovery/default inspection
- detailed command inventory, smoke entrypoints, and validation notes remain in
  the sections below plus:
  - [PROJECT_STATE.md](./PROJECT_STATE.md)
  - [PLANS.md](./PLANS.md)
  - [skills/QUICKSTART.md](./skills/QUICKSTART.md)

## Current Product Focus

For the current stage, the repo already has a usable zkSync-native execution
core. The remaining work is mostly productization: making the command surface,
defaults, docs, and operator path easier to consume and validate.

The active focus is:

- keep one obvious default path for setup, wallet recovery, funding, and
  execution across CLI help, connector handoff, and follow-up commands
- raise the command surface from address-first primitives toward
  product-level, symbol/discovery-assisted operator flows
- keep one installable agent-facing surface through `skills/`
- keep one connector flow that works both for colocated `--await-local`
  approval and relay/manual approval return
- keep ecosystem verticals explicitly demand-driven:
  no Polygon-style `polymarket` or `x402-pay` parity surface is currently
  justified on zkSync without stronger repeated operator demand
- keep one workflow-first action layer simpler than the lower-level direct
  commands
- continue chain validation only where the product path still has a real gap:
  L1 withdraw finalize broadcast validation, richer bridge coverage, broader swap routing, and
  broader validated defaults

## Recommended Operator Path

The canonical operator path is:

```bash
zk-agent setup
zk-agent next
zk-agent wallet create --await-local
zk-agent next
zk-agent workflow pay --wallet main --to <address> --amount <amount>
# Only if the CLI reports that gas funding is still required:
zk-agent workflow fund --wallet main --amount <amount> --execute
```

Interpretation:

1. `setup` writes local config.
2. `next` is the default decision point. Use it whenever you want the shortest
   valid next step across setup, wallet recovery, and stored workflows.
3. `wallet create --await-local` or `wallet reapprove --await-local` is the
   preferred local-first connector path for obtaining a writable local
   session; run `zk-agent next` again after the approval round-trip finishes.
4. `wallet next` and `wallet status` are the wallet-layer detailed views when
   the question is specifically about one stored wallet.
5. `workflow pay` is the default guided execution surface for the flagship
   native-send path. Use `workflow auto` when the workflow intent is broader
   than that one productized path.
6. `workflow start`, `workflow status`, `workflow next`, `workflow resume`, and
   `workflow fund` cover explicit checkpoint, resume, and funding-only cases.
7. `workflow run` remains available as the lower-level one-shot path.

Use the help entrypoint that matches the current question:

- `zk-agent --help` for the top-level product path
- `zk-agent wallet --help` for wallet/session recovery
- `zk-agent workflow --help` for workflow execution and resume

For connector relay fallback, encrypted approval payloads, checkpoint lifecycle,
and the full verified command sequence, use
[skills/QUICKSTART.md](./skills/QUICKSTART.md).

For the current machine-readable operator contract across `next`, `workflow`,
and the smoke/product validation layer, use
[docs/10-operator-json-contract.md](./docs/10-operator-json-contract.md).

## User-Facing Command Model

From an operator point of view, the CLI keeps one consistent shape:

```bash
zk-agent <top-level-command> [subcommand] [flags]
```

The public surface is intentionally organized around five questions:

1. What should I do next?
   Use `zk-agent --help` and `zk-agent next`.
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
- `defaults` is the machine-readable registry escape hatch for validated and
  fallback routes, tokens, and paymaster metadata
- `ZK_AGENT_TOKEN_DIRECTORY_ROOT` is the optional broader local token-directory
  input when repo-local deployment metadata is not enough

For the full command examples, relay/manual recovery flow, token-discovery
variants, and workflow checkpoint patterns, use:

- [packages/zk-agent-cli/README.md](./packages/zk-agent-cli/README.md)
- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [docs/10-operator-json-contract.md](./docs/10-operator-json-contract.md)

## Agent Skills

The repo now includes an agent-facing skills surface:

- [skills/SKILL.md](./skills/SKILL.md)
- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [skills/zk-defi/SKILL.md](./skills/zk-defi/SKILL.md)

These files are the shortest maintained entrypoint for agent harnesses that
need the current canonical CLI path without reading the entire repository.

## Development Environment Strategy

Current default:

- Primary development target: `zkSync Sepolia`
- Optional local fast-path: lightweight local node only when needed
- Deferred heavyweight environment: full local `ZK Stack` ecosystem

Why:

- Our current implementation focus is on:
  - wallet/session lifecycle
  - native AA transaction structure
  - paymaster-aware execution
  - connector approval flow
- These are better validated first against a real zkSync environment than against a freshly self-hosted local chain.
- The local docs indicate that a zkSync-specific local environment becomes much more important when testing:
  - bridging
  - cross-chain flows
  - L1 <-> L2 integration
  - Elastic Network behavior

Practical rule:

1. Use `zkSync Sepolia` as the default target while building wallet, session, AA, paymaster, and basic transaction features.
2. If we need faster local iteration for isolated testing, use a lightweight local node path rather than a full custom chain first.
3. Only stand up a full local `ZK Stack` environment once we actively implement and validate:
   - `bridge`
   - `deposit`
   - `withdraw`
   - L2 -> L2 / Elastic Network flows
   - chain-specific routing behavior

This keeps the early development loop cheaper while preserving a clear path to later `ZK Stack` support.

## Workspace

```text
zk-agent-cli/
├─ packages/
│  ├─ agent-core/
│  ├─ agent-session-protocol/
│  ├─ agent-tools/
│  ├─ provider-zksync-wallet/
│  ├─ provider-zksync-defi/
│  ├─ plugin-identity/
│  ├─ zk-agent-cli/
│  └─ zk-connector-ui/
├─ docs/
├─ AGENTS.md
├─ PLANS.md
├─ package.json
└─ pnpm-workspace.yaml
```

## Scripts

```bash
pnpm install
pnpm zk-agent --help
pnpm typecheck
pnpm test
pnpm build
pnpm release:check
pnpm validate:release
```

Common grouped entrypoints:

- development:
  - `pnpm install`
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm test`
- release gate:
  - `pnpm release:check`
  - `pnpm validate:release`
  - `pnpm validate:phase4a` remains as a legacy alias for `validate:release`
- agent-tools:
  - `pnpm tool:list`
  - `pnpm tool:run -- --tool <toolName> --input <json|@file>`
- high-signal smokes:
  - `pnpm smoke:discovery -- --wallet <name> [--symbol <symbol>]`
  - `pnpm smoke:hosted-relay -- --relay-url <url>`
  - `pnpm smoke:remote-approval -- --wallet <name> [--relay-url <url>]`
  - `pnpm smoke:flagship-workflow -- --wallet <name> [--relay-url <url>]`
  - `pnpm smoke:operator-path -- --wallet <name>`
  - `pnpm smoke:product-path -- --wallet <name>`

For the detailed smoke matrix, relay/manual-approval variants, and agent-tools
usage examples, use:

- [skills/QUICKSTART.md](./skills/QUICKSTART.md)
- [docs/11-npm-release-gate.md](./docs/11-npm-release-gate.md)

Test ERC-20 utility:

```bash
pnpm --filter @zk-agent/paymaster-test-assets compile
pnpm --filter @zk-agent/paymaster-test-assets deploy
pnpm --filter @zk-agent/paymaster-test-assets compile:eravm
pnpm --filter @zk-agent/paymaster-test-assets deploy:token:eravm
pnpm --filter @zk-agent/paymaster-test-assets deploy:paymaster
```

## Test ERC-20 Package

`packages/paymaster-test-assets` is a small workspace package that gives us deterministic
Sepolia assets for paymaster testing, so we do not need to depend on third-party
token or paymaster addresses.

What it does:

- compiles `contracts/StandardTestToken.sol` with standard `solc`
- writes the artifact to `packages/paymaster-test-assets/artifacts/StandardTestToken.json`
- deploys the token to zkSync Sepolia through standard EVM bytecode deployment
- records the latest deployment in `packages/paymaster-test-assets/deployments/zksync-sepolia.latest.json`
- can also export and deploy the same token as native EraVM bytecode for
  approval-based compatibility testing
- compiles and deploys the EraVM-native `ManagedPaymaster`

Why it uses this route:

- the package exists to produce deterministic paymaster test assets
- zkSync's EVM Interpreter is still useful as a cheap baseline for standard
  ERC-20 deployment
- but Sepolia validation showed that approval-based live broadcast can depend on
  whether the fee token itself is deployed as native EraVM bytecode

Configuration lives in the root `.env` file. A safe template is provided in `.env.example`.

Relevant fields:

- `ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY`
- `ZKSYNC_SEPOLIA_WALLET_ADDRESS`
- `ZKSYNC_SEPOLIA_RPC_URL`
- `ZKSYNC_SWAP_ROUTER_ADDRESS`
- `ZKSYNC_SWAP_FEE_TIER`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_NAME`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SYMBOL`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_DECIMALS`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SUPPLY`

## Environment and Config Notes

- zkSync Sepolia reads now honor `ZKSYNC_SEPOLIA_RPC_URL` everywhere the built-in
  chain definition is resolved, not only in package-specific deploy scripts.
- In the Codex sandbox used for this repository, public RPC hostname resolution
  is not reliable. If `sepolia.era.zksync.dev` or other RPC hosts fail inside
  the sandbox, retry from the host shell or an approved unsandboxed command
  before concluding that the endpoint is unavailable.
- `deploy` sends a real transaction to `zkSync Sepolia`.
- The configured wallet address must match the configured private key.
- The default template uses `18` decimals because raw token units matter for
  approval-based paymaster testing.
- `artifacts/` and `deployments/` are intentionally git-ignored.

## Paymaster Validation Summary

Key distinction:

- a token can work as a normal ERC-20 transfer target
- that same token can still fail as an approval-based paymaster fee token

Current guidance:

- use `--paymaster-mode none` to validate the base transaction path first
- if `swap` fails during approval-based estimation, rerun it with
  `--paymaster-mode none` to separate swap-path issues from paymaster/fee-token
  issues
- only use `approval-based` with tokens that have been explicitly validated for
  the active paymaster path

Current local Sepolia result:

- a self-deployed EraVM `ManagedPaymaster` plus an EVM-interpreter ERC-20 makes
  approval-based preview / estimation succeed
- that same EVM-interpreter fee-token path is still rejected on live broadcast
  with a `SystemContext`-related validation failure
- once the fee token itself is also deployed as native EraVM bytecode,
  approval-based live broadcast succeeds
- locally deployed zkSync test ERC-20s work for same-chain transfer and swap
  testing, but L2 -> L1 `withdraw` / `bridge` preview still fails with
  `WITHDRAW_ESTIMATION_BRIDGE_ROUTER_REJECTED` and `validation.kind =
  asset-id-mismatch` because those assets do not have the canonical shared-bridge
  L1 mapping required by the current route

Practical conclusion:

- custom paymaster live broadcast works
- approval-based live broadcast works on the validated EraVM token path
- fee-token implementation details materially affect live validation

## Smart-Account Validation Summary

Current CLI surface:

- `wallet status` surfaces undeployed records, signer mismatches, and
  fully write-ready wallets
- `wallet smart-account predict|deploy` supports built-in profiles such as
  `sed-lite` and `daily-spend-limit`
- `wallet smart-account deploy` saves the deployed address locally and now
  returns `wallet status` / `wallet next` follow-ups

Current base profile:

- `sed-lite` is the main AA base profile in this repository
- future AA defaults, flagship workflow validation, and operator-facing
  examples should stay on `sed-lite`
- it preserves the current CLI/provider ECDSA flow while moving signature
  checks behind a dedicated K1 validator
- it splits account internals into lighter Auth/Manager layers and keeps a
  modular owner/self/module shape derived from Clave
- it already supports owner rotation, module toggling, native per-tx caps, and
  a minimal external validation-hook pipeline

Validated hook contracts on Sepolia:

- `NativePerTxLimitHook`
- `TargetAllowlistHook` at `0x7d397543D22a01e38e73c1029af7EbdF6F8D13BD`
- `TargetSelectorAllowlistHook` at `0x06FBe4ddda312311694DB81f9471b20E66101dEe`

Validated `sed-lite` behavior on Sepolia:

- `predict` and `deploy` work
- owner and cap reads work
- plain native transfer works after funding the account
- native per-transaction cap writes work
- over-cap native transfers are rejected during validation
- below-cap native transfers still succeed

Validated hook-layer behavior on Sepolia:

- `NativePerTxLimitHook` deploys as a standalone EraVM contract
- a fresh `sed-lite` deployment can enable hooks and read back per-account hook
  state onchain
- with the native-cap hook enabled, below-cap transfers succeed and over-cap
  transfers are rejected during validation
- the same native-cap hook also works on the approval-based paymaster path:
  below-cap transactions succeed with fee-token payment, while over-cap
  transactions are rejected during paymaster fee estimation with the same
  hook-specific reason
- `TargetAllowlistHook` allows allowlisted recipients and rejects
  non-allowlisted recipients with `Target is not allowlisted`
- `TargetSelectorAllowlistHook` allows configured `(target, selector)` pairs and
  rejects non-allowlisted selectors with `Target selector is not allowlisted`

Current limitations and cautions:

- `wallet smart-account daily-spend-limit show|set|remove` drives the built-in
  profile state through the existing call/write pipeline, but native-transfer
  enforcement for `daily-spend-limit` still needs more EraVM-specific work
- `daily-spend-limit` should not be used as the default AA acceptance wallet:
  it is now treated as a constrained experimental profile, not the repository
  baseline
- execution-time checks on that profile do not currently catch plain native
  sends, while validation-time checks hit the documented `SystemContext`
  restriction because the policy uses `block.timestamp`
- built-in profiles still require a zkSync-compatible EraVM account artifact
  before they can actually deploy; standard EVM `solc` artifacts are not enough
- the generic deploy / reconstruct / restore lifecycle is still not finished
- older `sed-lite` deployments that predate hook support need a fresh redeploy
  to expose the new hook methods
- write commands now fail early for undeployed smart-account records instead of
  returning misleading previews
- current Sepolia broadcast results should not be treated as proof that the
  long-term smart-account design is finished

## Notes

- Verified local defaults in this repository currently include:
  - `zkSync Era` chain ID `324`
  - `zkSync Sepolia` chain ID `300`
  - mainnet RPC `https://mainnet.era.zksync.io/`
  - sepolia RPC `https://sepolia.era.zksync.dev`
- Other Elastic Network chains should be added through explicit registry entries instead of hardcoded guesses.

## License

MIT. See `LICENSE`.
