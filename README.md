# zk-agent-cli

`zk-agent-cli` is a local-first monorepo for building an agent-oriented CLI on top of `zkSync Era` and the wider `ZK Stack`.

Current handoff snapshot:

- [PROJECT_STATE.md](./PROJECT_STATE.md)

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
- built-in AA profile registry in `packages/account-profiles`
- initial Commander-based CLI commands
- local wallet record maintenance via `wallet rename`
- local `packages/paymaster-test-assets` utility package for compiling and deploying paymaster test assets on zkSync Sepolia
- `zksync-ethers` read path for balances and contract calls
- thin AA-oriented transaction commands for:
  - `send`
  - `send-token`
  - write-mode `call`
- `wallet status` inspection for:
  - execution address vs owner address
  - session signer consistency
  - deployed vs undeployed smart-account state
  - local write readiness blockers
- local connector approval loop support via:
  - `wallet create --await-local`
  - auto-consume of approved local requests
  - `wallet request await-local`
  - `wallet request list` with expired-request pruning
  - connector callback handoff back into the waiting CLI process
- first agent-facing tool surface in `packages/agent-tools` for:
  - create wallet request
  - wallet status
  - balances
  - contract read
  - native send
  - token send
  - contract write
  - smart-account plan/deploy wrappers
  - default `createZkSyncAgentTools()` / `createZkSyncAgentToolContext()` factories
  - `pnpm --filter @zk-agent/agent-tools tool:run -- --list`
  - `pnpm --filter @zk-agent/agent-tools tool:run -- --tool <toolName> --input <json|@file>`
  - `pnpm --filter @zk-agent/agent-tools smoke:readonly -- --wallet <name> [--call-to <address> --call-data <hex>]` for real provider read-only smoke
- `wallet paymaster set` for updating saved default paymaster metadata on a
  stored wallet
- generic `wallet smart-account predict|deploy` flow for:
  - artifact-driven address prediction
  - account deployment via `createAccount` / `create2Account`
  - saving the deployed execution address back into the local wallet record
- first built-in smart-account profile:
  - `sed-lite`
  - source checked into the workspace
  - CLI profile discovery via `wallet smart-account profiles`
  - profile-specific account management via
    `wallet smart-account sed-lite owner|owner-set|validator|validator-set|module|module-add|module-remove|hook|hooks|hook-add|hook-remove|limit|limit-set|limit-remove|native-cap-hook|target-allowlist-hook|selector-allowlist-hook`
- second built-in smart-account profile:
  - `daily-spend-limit`
  - source checked into the workspace
  - CLI profile discovery via `wallet smart-account profiles`
  - profile-specific limit management via
    `wallet smart-account daily-spend-limit show|set|remove`
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
  - approval-based live broadcast now works on the validated EraVM token path
- background docs in `docs/`
- execution plan in `PLANS.md`
- cross-environment handoff snapshot in `PROJECT_STATE.md`

What is next:

- push policy work onto the `sed-lite` hook path instead of hardcoding it into account core
- validate smart-account writes through paymaster mode once the base no-paymaster path is stable
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

- a self-deployed EraVM `ManagedPaymaster` plus an EVM-interpreter ERC-20 can
  make approval-based preview / estimation succeed
- that same EVM-interpreter fee-token path is still rejected on live broadcast
  with a `SystemContext`-related validation failure
- once the fee token itself is also deployed as native EraVM bytecode,
  approval-based live broadcast succeeds
- the practical conclusion is:
  - custom paymaster live broadcast works
  - approval-based live broadcast works on the validated EraVM token path
  - fee-token implementation details matter for live validation

Important:

- `wallet status` now surfaces when a record is still undeployed or has signer metadata mismatches
- `wallet status` now also shows when a record is fully write-ready after deployment
- `wallet smart-account predict|deploy` now exists, and it can now resolve built-in profiles such as `sed-lite` and `daily-spend-limit`
- `sed-lite` is now the better general-purpose AA base profile in this repository:
  - it keeps the current raw ECDSA signing compatibility of the CLI/provider
    while moving signature checks behind a dedicated K1 validator contract
  - it now also splits account internals into lightweight Auth/Manager layers,
    so future AA upgrades do not need to keep expanding one monolithic account contract
  - it takes the modular owner/self/module shape from Clave instead of hardcoding policy into the account core
  - it can already rotate owner, toggle modules, and manage a native per-transaction cap through self-calls
  - it now also has a minimal validation-hook pipeline for externalized policy contracts
  - `NativePerTxLimitHook` is live-validated on Sepolia
  - `TargetAllowlistHook` is now deployed on Sepolia at `0x7d397543D22a01e38e73c1029af7EbdF6F8D13BD`, and is now live-validated
  - `TargetSelectorAllowlistHook` is now deployed on Sepolia at `0x06FBe4ddda312311694DB81f9471b20E66101dEe`, and is now live-validated on the base no-paymaster path
- live Sepolia validation is now complete for the base `sed-lite` path:
  - `predict` works
  - `deploy` works
  - owner and cap reads work
  - plain native transfer works after funding the account
  - setting a native per-transaction cap works
  - an over-cap native transfer is rejected during account validation
  - a below-cap native transfer still succeeds
- live Sepolia validation now also covers the next AA layer on top of `sed-lite`:
  - `NativePerTxLimitHook` now deploys as a standalone EraVM contract
  - a fresh `sed-lite` deployment can list enabled hooks onchain
  - the hook can be enabled through a smart-account self-call
  - the hook's per-account cap state can be read back onchain
  - an over-cap native transfer is rejected during validation with the hook-specific error
  - a below-cap native transfer still succeeds with the hook enabled
  - the same hook also works with the approval-based paymaster path:
    - a below-cap transaction succeeds with fee-token payment
    - an over-cap transaction is rejected during paymaster fee estimation with the same hook-specific reason
  - `TargetAllowlistHook` is now also live-validated on Sepolia:
    - the hook can be enabled through a smart-account self-call when the account pays ETH directly
    - the allowlisted target set can be read back onchain
    - a transfer to an allowlisted recipient succeeds
    - a transfer to a non-allowlisted recipient is rejected during account validation with `Target is not allowlisted`
  - `TargetSelectorAllowlistHook` is now also live-validated on Sepolia:
    - the hook can be enabled through a smart-account self-call when the account pays ETH directly
    - the configured `(target, selector)` rule can be read back onchain
    - an allowlisted selector call succeeds, validated with ERC-20 `approve(address,uint256)`
    - a non-allowlisted selector call to the same target is rejected during account validation with `Target selector is not allowlisted`
- `wallet smart-account daily-spend-limit show|set|remove` now drives the
  built-in profile's native spend-limit state through the existing call/write
  pipeline
- live Sepolia validation still shows that native-transfer enforcement for the
  built-in `daily-spend-limit` profile needs more EraVM-specific work:
  execution-time checks do not currently catch plain native sends, while
  validation-time checks immediately hit the documented `SystemContext`
  restriction because the policy uses `block.timestamp`
- built-in profiles still require a zkSync-compatible EraVM account artifact before they can actually deploy
- standard EVM `solc` artifacts are not enough for this path; the current command returns a structured error instead of a raw SDK exception
- `daily-spend-limit` is the first concrete AA profile we chose for this repository, but its current policy hook only limits native-token spending
- the generic deploy / reconstruct / restore lifecycle is still not finished yet
- older `sed-lite` deployments that predate hook support cannot expose the new hook methods and need a fresh redeploy
- write commands now fail early for undeployed smart-account records instead of returning misleading previews
- so do not read current Sepolia broadcast results as proof that the long-term smart-account design is correct

## Notes

- Verified local defaults in this repository currently include:
  - `zkSync Era` chain ID `324`
  - `zkSync Sepolia` chain ID `300`
  - mainnet RPC `https://mainnet.era.zksync.io/`
  - sepolia RPC `https://sepolia.era.zksync.dev`
- Other Elastic Network chains should be added through explicit registry entries instead of hardcoded guesses.
