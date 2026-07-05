# zk-agent-cli Quickstart

This quickstart is intentionally narrow. It describes the shortest verified
operator path for the current phase of the project.

## 1. Install dependencies

From the repository root:

```bash
pnpm install
```

## 2. Initialize local config

```bash
pnpm zk-agent setup
```

Expected result:

- local config is saved under `~/.zk-agent/config.json`
- the CLI prints the default operator-path follow-ups:
  - `zk-agent defaults`
  - `zk-agent wallet create --await-local`
  - `zk-agent next`

## 3. Create a writable wallet session

```bash
pnpm zk-agent wallet create --await-local
```

This is the preferred path because the CLI waits for the local connector
callback and stores the approved session immediately.

The command output also includes the post-approval follow-ups:

- `zk-agent next`
- `zk-agent wallet status --name <wallet>`

The surrounding wallet-management commands follow the same pattern:
`wallet list`, `wallet request list`, `wallet export`, `wallet rename`,
`wallet address`, and `wallet remove` also return explicit follow-up commands.

When you want the canonical wallet command sequence, run:

```bash
pnpm zk-agent wallet --help
```

If a wallet already exists but the writable local session is missing or stale:

```bash
pnpm zk-agent wallet reapprove --name main --await-local
```

Manual fallback when the connector cannot call back into the waiting CLI:

```bash
pnpm zk-agent relay serve
pnpm zk-agent wallet create --relay-url <relay-url>
pnpm zk-agent wallet request approve --request-id <id> --relay-url <relay-url> --code <code> --wait
```

`relay serve` now also prints the relay-aware `wallet create` and `wallet
reapprove` follow-up commands directly, so the operator can copy the exact next
step from the server output.

The same remote path also works for an existing wallet that needs a fresh
session:

```bash
pnpm zk-agent wallet reapprove --name main --relay-url <relay-url>
```

Encrypted relay fallback:

```bash
pnpm zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>
```

## 4. Inspect readiness

Inspect the currently tracked validated Sepolia router / paymaster / fee-token
defaults when you need the machine-readable baseline:

```bash
pnpm zk-agent defaults
```

```bash
pnpm zk-agent resolve-token --chain zksync-sepolia --symbol USDC
```

Shortest next-step summary across setup, wallet readiness, and stored workflow checkpoints:

```bash
pnpm zk-agent next
```

Wallet-only detailed view:

```bash
pnpm zk-agent wallet next --name main
```

Full readiness inspection plus the same recommendation:

```bash
pnpm zk-agent wallet status --name main
```

## 5. Fund only if the CLI says funding is required

Guidance only:

```bash
pnpm zk-agent workflow fund --wallet main
```

Dispatch the suggested funding route:

```bash
pnpm zk-agent workflow fund --wallet main --amount <amount> --execute
```

## 6. Use workflow auto as the default guided write path

Preview a native send:

```bash
pnpm zk-agent workflow auto --wallet main --intent send-native --to <address> --amount <amount> --create-checkpoint --execute-when-ready
```

Equivalent shortcut:

```bash
pnpm zk-agent workflow send-native --wallet main --to <address> --amount <amount>
```

Broadcast the same send:

```bash
pnpm zk-agent workflow auto --wallet main --intent send-native --to <address> --amount <amount> --create-checkpoint --execute-when-ready --broadcast
```

The same workflow surface also supports:

- `send-token`
- `call-write`
- `swap`
- `bridge`
- `deposit`
- `withdraw`

When you need the canonical workflow command sequence, run:

```bash
pnpm zk-agent workflow --help
```

Use `workflow run` only when you explicitly want the lower-level one-shot
orchestration surface without the guided wrapper.

If `workflow auto|run|status|resume` is blocked on a missing writable session, add
`--ensure-wallet-session`. Add `--relay-url <url>` when you want the workflow
command to auto-publish the approval request to the relay and emit relay
status/approve follow-up commands instead of only local callback guidance.

## 7. Resume blocked or long-running flows

List stored checkpoints:

```bash
pnpm zk-agent workflow list
```

Inspect one checkpoint:

```bash
pnpm zk-agent workflow show --request-id <id>
```

Check whether it is ready to continue:

```bash
pnpm zk-agent workflow status --request-id <id>
```

Ask for the single shortest next step:

```bash
pnpm zk-agent workflow next --request-id <id>
```

`workflow auto`, `workflow start`, `workflow status`, `workflow next`,
`workflow resume`, `workflow run`, the intent shortcut commands, and
`zk-agent next --request-id <id>` now also return explicit
`recommendedCommands` in JSON mode. Tokenized workflow outputs additionally
surface `discoverAssets`, `discoverOwnedTokens`, `discoverTokens`, and
`inspectToken`, so agent-driven callers can keep moving without rebuilding
token-registry recovery paths themselves.

Resume when ready:

```bash
pnpm zk-agent workflow resume --request-id <id> --broadcast
```

## 8. Use direct commands only when you intentionally need them

Examples:

```bash
pnpm zk-agent balances --wallet main
pnpm zk-agent balances --wallet main --owned-tokens
pnpm zk-agent assets --wallet main
pnpm zk-agent send --wallet main --to <address> --amount <amount>
pnpm zk-agent swap --wallet main --protocol syncswap-classic [--token-in <address>|--token-in-symbol <symbol>] [--token-out <address>|--token-out-symbol <symbol>] --amount-in <amount> --amount-out-min <amount>
pnpm zk-agent bridge --wallet main --amount <amount> [--to-chain zksync-sepolia]
pnpm zk-agent withdraw --wallet main --amount <amount>
pnpm zk-agent withdraw-status --wallet main --tx-hash <hash>
pnpm zk-agent withdraw-finalize --wallet main --tx-hash <hash>
```

For `syncswap-classic`, tracked Sepolia router/factory defaults are used when
`--router` and `--factory` are omitted.

For local test assets already recorded under
`packages/paymaster-test-assets/deployments`, tokenized `fund`,
`send-token`, `swap`, `bridge`, `deposit`, `withdraw`, and the matching
workflow intents can resolve token address/decimals from the stored symbol on
the active chain.

If `ZK_AGENT_TOKEN_DIRECTORY_ROOT` is set to a local token-directory checkout
or export with `index/index.json`, the same tokenized commands also fall back
to that directory after local deployment metadata.

To generate a local export directly from this repo's tracked deployment records,
run `pnpm --filter @zk-agent/paymaster-test-assets export:token-directory` and
point `ZK_AGENT_TOKEN_DIRECTORY_ROOT` at
`packages/paymaster-test-assets/token-directory`.

Inspect discoverable tokens before running a tokenized command:

```bash
pnpm zk-agent tokens --chain zksync-sepolia
pnpm zk-agent tokens --chain zksync-sepolia --symbol USDC
pnpm zk-agent tokens --wallet main --owned
pnpm zk-agent resolve-token --chain zksync-sepolia --symbol USDC
```

Use `assets` as the default single-chain asset entrypoint. Keep
`balances --owned-tokens` for the raw balances surface and `tokens --owned`
for the narrower owned ERC-20 registry subset.

`pnpm zk-agent defaults` now also shows that source order and token-directory
chain coverage explicitly.

For `workflow plan`, the CLI now also fills the tracked default swap or bridge
route when the current registry/default set makes that path unambiguous.

For workflow bridge goals, `workflow auto|run|status|next` can also reuse the
tracked default destination route for the current wallet chain when `--to-chain`
is omitted.

The direct `bridge` command now follows the same rule.

## 9. Smart-account path

List built-in profiles:

```bash
pnpm zk-agent wallet smart-account profiles
```

Predict and deploy the primary built-in profile:

```bash
pnpm zk-agent wallet smart-account predict --name main --profile sed-lite
pnpm zk-agent wallet smart-account deploy --name main --profile sed-lite
```

`wallet smart-account predict` now returns the matching deploy command in
`recommendedCommands.deploy`, and `wallet smart-account deploy` returns
post-deploy `wallet status` / `wallet next` follow-ups when the deployed address
is saved back into the local wallet record.

The profile-management write commands under `wallet smart-account sed-lite ...`
and `wallet smart-account daily-spend-limit ...` now also return structured
`recommendedCommands` in JSON mode, including the concrete preview rerun command
when the current result is still a preview.

## 10. Programmatic tool surface

List tools:

```bash
pnpm tool:list
```

Run a tool:

```bash
pnpm tool:run -- --tool walletStatusTool --input '{"walletName":"main"}'
pnpm tool:run -- --tool getAssetsTool --input '{"walletName":"main"}'
```

When listing tools with `pnpm tool:run -- --list`, high-frequency entries now
appear first and each item includes a `group` field plus the closest
`cliCommand` equivalent. Treat `workflowAutoTool` as the default guided
workflow entry. `workflowOrchestratorTool` remains available as a compatibility
alias.

For the default product path, key tools also expose `operatorPathStage`:

- `decide-next`: start from `topLevelNextTool`
- `acquire-session`: wallet create/reapprove/orchestrated approval
- `guided-execution`: `workflowAutoTool`
- `funding-fallback`: `workflowFundTool`
- `checkpoint-follow-up`: `workflowStatusByCheckpointTool`, `workflowNextByCheckpointTool`, `workflowRunByCheckpointTool`

The list response also includes a top-level `recommendedSequence`, which
already orders those stages for the default product path.

Preferred root wrappers for the validated product smokes:

```bash
pnpm smoke:operator-path -- --wallet <name>
pnpm smoke:product-path -- --wallet <name> [--tx-hash <withdrawTxHash>]
pnpm smoke:paymaster-success -- --wallet <name>
pnpm validate:phase3
```

Those smoke JSON responses now preserve structured workflow follow-ups:

- `smoke:operator-path` includes `summary.topLevelRecommendedCommands` and
  `summary.workflowRecommendedCommands`
- `smoke:product-path` includes per-step `summary.followups`
- `smoke:paymaster-success` includes `result.recommendedCommands`

## Known constraints

- approval-based paymaster mode is not valid for every ERC-20 fee token
- on `zksync-sepolia`, approval-based mode can auto-fill the tracked validated paymaster + EraVM fee-token defaults when only the mode is supplied
- direct remote approval is available through `relay serve` + `wallet create|reapprove --relay-url` + `wallet request approve`, including an encrypted relay-package path, but `--await-local` remains the default path
- sandbox DNS can fail even when the public RPC endpoint is healthy
- for current phase work, prefer:
  - `wallet create --await-local`
  - `wallet reapprove --await-local`
  - `wallet next`
  - `wallet status`
  - `workflow auto`

For detailed action-path examples, read:

- [zk-defi/SKILL.md](./zk-defi/SKILL.md)
