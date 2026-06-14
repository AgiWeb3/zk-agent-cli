# zk-agent-cli

`zk-agent-cli` is a local-first monorepo for building an agent-oriented CLI on top of `zkSync Era` and the wider `ZK Stack`.

The project is intentionally modeled after the real architecture of `polygon-agent-cli`, but it is not a direct fork. The goal is to preserve the reusable system shape:

- CLI entrypoint for humans and agent harnesses
- browser connector UI for session approval
- shared protocol package for session payloads, relay messages, and crypto
- core package for storage, chain registry, and provider interfaces
- provider packages for zkSync-specific wallet and DeFi capabilities
- agent tool adapters for LLM / framework integration

## Current Phase

The project has moved past background analysis and is now in formal implementation.

What is already in place:

- workspace structure
- provider boundaries
- local storage model
- session protocol package
- initial Commander-based CLI commands
- local `packages/test-erc20` utility package for compiling and deploying a standard ERC-20 on zkSync Sepolia
- `zksync-ethers` read path for balances and contract calls
- thin AA-oriented transaction commands for:
  - `send`
  - `send-token`
  - write-mode `call`
- zkSync-native transaction previews for type `113` requests
- paymaster metadata wiring for:
  - session approval payloads
  - CLI command selection
  - preview output
  - structured JSON errors when live provider support is missing
- live paymaster transaction preparation for:
  - General flow (`sponsored`)
  - zkSync testnet ApprovalBased flow with automatic testnet paymaster resolution
- Sepolia validation result:
  - `send-token` preview works with `--paymaster-mode none`
  - approval-based paymaster still requires explicit fee-token validation and cannot assume that any ERC-20 is usable
  - approval-based preview now succeeds with the self-deployed `18 decimals` test token
  - approval-based broadcast is still rejected by chain-side validation on Sepolia
- background docs in `docs/`
- execution plan in `PLANS.md`

What is next:

- richer wallet/session records
- connector approval flow
- funded paymaster broadcast validation on zkSync Sepolia
- bridge / deposit / withdraw / swap implementations

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
pnpm zksync-agent --help
pnpm typecheck
pnpm test
pnpm build
```

Test ERC-20 utility:

```bash
pnpm --filter @zk-agent/test-erc20 compile
pnpm --filter @zk-agent/test-erc20 deploy
```

## Test ERC-20 Package

`packages/test-erc20` is a small workspace package that gives us a deterministic standard ERC-20 for zkSync Sepolia testing, so we do not need to depend on a third-party faucet token address.

What it does:

- compiles `contracts/StandardTestToken.sol` with standard `solc`
- writes the artifact to `packages/test-erc20/artifacts/StandardTestToken.json`
- deploys the token to zkSync Sepolia through standard EVM bytecode deployment
- records the latest deployment in `packages/test-erc20/deployments/zksync-sepolia.latest.json`

Why it uses this route:

- the package exists to produce a deterministic ERC-20 for paymaster testing
- native EraVM compiler setup added unnecessary friction for this isolated task
- zkSync's EVM Interpreter lets us deploy standard EVM bytecode while keeping the main CLI project focused on zkSync-native transaction execution

Configuration lives in the root `.env` file. A safe template is provided in `.env.example`.

Relevant fields:

- `ZKSYNC_SEPOLIA_WALLET_PRIVATE_KEY`
- `ZKSYNC_SEPOLIA_WALLET_ADDRESS`
- `ZKSYNC_SEPOLIA_RPC_URL`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_NAME`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SYMBOL`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_DECIMALS`
- `ZKSYNC_SEPOLIA_TEST_TOKEN_SUPPLY`

Important:

- `deploy` sends a real transaction to `zkSync Sepolia`
- the configured wallet address must match the configured private key
- the default template uses `18` decimals because raw token units matter for approval-based paymaster testing
- `artifacts/` and `deployments/` are intentionally git-ignored

## Paymaster Testing Note

Current Sepolia testing in this repository showed an important distinction:

- a token can work as a normal ERC-20 transfer target
- that same token can still fail as an approval-based paymaster fee token

So for `approval-based` testing, do not assume "standard ERC-20" automatically means "valid paymaster fee token".

For now:

- use `--paymaster-mode none` to validate the base transaction path
- only use `approval-based` with tokens that have been explicitly validated for the active paymaster path

Latest local result:

- a self-deployed `18 decimals` token can make approval-based preview / estimation succeed
- the same transaction is still rejected on real broadcast with:
  - `Touched disallowed storage slots: address 0x000000000000000000000000000000000000800b, key: 1`
- local `zksync-docs` map `0x...800b` to `SystemContext`
- current interpretation:
  - fee-token compatibility is now validated
  - the remaining blocker is broadcast-path validation, not token compatibility

Important:

- current `smart-account` sessions in this repository are still metadata-level
- real smart-account deployment / reconstruction is not finished yet
- so do not read current Sepolia broadcast results as proof that the long-term smart-account design is correct

## Notes

- Verified local defaults in this repository currently include:
  - `zkSync Era` chain ID `324`
  - `zkSync Sepolia` chain ID `300`
  - mainnet RPC `https://mainnet.era.zksync.io/`
  - sepolia RPC `https://sepolia.era.zksync.dev`
- Other Elastic Network chains should be added through explicit registry entries instead of hardcoded guesses.
