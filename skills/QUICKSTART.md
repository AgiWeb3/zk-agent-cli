# zk-agent-cli Quickstart

This quickstart is intentionally narrow. It describes the shortest verified
operator path for the current product baseline.

The commands below use the packaged CLI path:

```bash
zk-agent <command>
```

One-shot execution uses the same surface under:

```bash
npx zk-agent-cli <command>
```

If you are running from a checked-out repository instead of the published
package, replace `zk-agent` with `pnpm zk-agent`.

## Prerequisites

- Node.js `>=24`
- the default local approval path expects the connector UI at
  `http://localhost:4444`; override it with
  `zk-agent setup --connector-url <url>` when needed
- the CLI auto-loads `.env` from the current working directory; `setup`,
  `next`, and wallet-request creation usually work without custom RPC values,
  but live chain reads or broadcasts usually need the relevant RPC variables

## 1. Choose an entrypoint

Choose the entrypoint that matches the environment.

If you are adding this project to a compatible agent harness, use the repo
skill install:

```bash
npx skills add https://github.com/AgiWeb3/zk-agent-cli
```

This repo currently ships a repo skill bundle for compatible harnesses. It
does not yet ship a native ChatGPT/Codex plugin bundle such as
`.codex-plugin/plugin.json`.

If you want the CLI directly in a terminal, use one of the packaged paths
below.

One-shot verification:

```bash
npx zk-agent-cli --help
```

Global install:

```bash
npm install -g zk-agent-cli
```

The global install exposes both `zk-agent` and `zksync-agent`. This quickstart
uses `zk-agent` as the canonical form.

## 2. Initialize local config

```bash
zk-agent setup
```

Expected result:

- local config is saved under `~/.zk-agent/config.json`
- the CLI prints the default operator-path follow-ups:
  - `zk-agent defaults`
  - `zk-agent wallet create --await-local`
  - `zk-agent next`

## 3. Create a writable wallet session

```bash
zk-agent wallet create --await-local
```

This is the preferred path because the CLI waits for the local connector
callback and stores the approved session immediately.

When the session should be tighter than the default unrestricted write path,
add request-time guardrails directly here:

```bash
zk-agent wallet create --await-local --session-preset transfer-only
zk-agent wallet create --await-local --session-hours 12 --allow-contract <contract-address> --allow-transfer-to <recipient-address>
zk-agent wallet reapprove --name main --session-preset full-access
zk-agent wallet reapprove --name main --disallow-contract-calls
```

`wallet reapprove` keeps the current stored session permissions by default. Only
pass `--session-preset`, `--session-hours`, `--allow-transfer-to`,
`--allow-contract`, `--disallow-transfers`, or `--disallow-contract-calls`
when you want to replace those defaults.

The command output also includes the post-approval follow-ups:

- `zk-agent next`
- `zk-agent wallet status --name <wallet>`

If you want the local operator identity bound to this wallet, save it once:

```bash
zk-agent agent set --name "<operator-name>" --wallet main
```

The surrounding wallet-management commands follow the same pattern:
`wallet list`, `wallet request list`, `wallet export`, `wallet rename`,
`wallet address`, and `wallet remove` also return explicit follow-up commands.

When you want the canonical wallet command sequence, run:

```bash
zk-agent wallet --help
```

If a wallet already exists and approval metadata is missing or expired:

```bash
zk-agent wallet reapprove --name main --await-local
zk-agent next
```

If approval is still present but the local execution signer is missing:

```bash
zk-agent wallet signer attach --name main --private-key <hex>
zk-agent next
```

Keep that local-first path as the default baseline whenever the browser and
terminal can be colocated.

Shortest hosted relay-backed completion path in one terminal process:

```bash
zk-agent relay inspect --relay-url <relay-url>
zk-agent wallet create --relay-url <relay-url> --wait-relay --prompt-code
zk-agent wallet reapprove --name main --relay-url <relay-url> --wait-relay --prompt-code
```

Manual fallback when the connector cannot call back into the waiting CLI:

```bash
zk-agent relay serve --public-origin https://relay.example.com
zk-agent wallet create --relay-url <relay-url>
zk-agent wallet request approve --request-id <id> --relay-url <relay-url> --code <code> --wait
```

`relay serve` now also prints the relay-aware `wallet create` and `wallet
reapprove` follow-up commands directly, so the operator can copy the exact next
step from the server output. Use `relay inspect --relay-url <url>` before the
hosted path when you need to confirm that an external relay exposes the
expected zk-agent compatibility contract, does not still advertise a
localhost-only `publicOrigin`, and is actually ready for hosted share-link
approval.

The same remote path also works for an existing wallet that needs a fresh
approved session:

```bash
zk-agent wallet reapprove --name main --relay-url <relay-url>
```

Current flagship AA smoke:

```bash
pnpm smoke:flagship-workflow -- --wallet <name> [--paymaster-mode approval-based|sponsored]
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <relay-url> [--paymaster-mode approval-based|sponsored]
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <relay-url> --manual-approval
pnpm smoke:flagship-workflow -- --wallet <name> --relay-url <relay-url> --manual-approval --prompt-code
```

Encrypted relay fallback:

```bash
zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>
```

## 4. Inspect readiness

Inspect the currently tracked validated Sepolia router / paymaster / fee-token
defaults when you need the machine-readable baseline:

```bash
zk-agent defaults
```

Use `assets` as the default single-chain asset entrypoint. Keep
`balances --owned-tokens` for the raw balances surface and `tokens --owned`
for the narrower owned ERC-20 registry subset. `zk-agent defaults` now also
shows that source order and token-directory chain coverage explicitly.

When you need the broader symbol-first discovery path for a chain, start with:

```bash
zk-agent tokens --chain zksync-sepolia
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --role paymaster-fee-token
```

Shortest next-step summary across setup, wallet readiness, and stored workflow checkpoints:

```bash
zk-agent next
```

If you want the wallet-scoped recommendation to stay on a specific paymaster
path during preview or operator guidance:

```bash
zk-agent next --paymaster-mode sponsored
```

Wallet-only detailed view:

```bash
zk-agent wallet next --name main
```

Full readiness inspection plus the same recommendation:

```bash
zk-agent wallet status --name main
```

## 5. Fund only if the CLI says funding is required

Guidance only:

```bash
zk-agent workflow fund --wallet main
```

Dispatch the suggested funding route:

```bash
zk-agent workflow fund --wallet main --amount <amount> --execute
```

## 6. Use workflow pay as the default flagship write path

Current flagship AA native-pay path:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

Broadcast the same flagship path:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --broadcast
```

Use a `sed-lite` wallet for this default AA path. Keep `daily-spend-limit`
only for profile-specific policy checks or control-wallet validation.

Use `workflow pay` when the goal is the current flagship AA native send. It
fixes the workflow to `send-native`, persists a checkpoint, executes when
ready, reopens a missing writable session through the intent-scoped approval
path, and defaults to approval-based paymaster mode unless you override it.

Keep `workflow auto` for broader multi-intent guided flows such as swap,
bridge, deposit, and withdraw.

Preview a native send:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount>
```

Equivalent shortcut:

```bash
zk-agent workflow send-native --wallet main --to <address> --amount <amount>
```

Broadcast the same send:

```bash
zk-agent workflow pay --wallet main --to <address> --amount <amount> --broadcast
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
zk-agent workflow --help
```

Use `workflow run` only when you explicitly want the lower-level one-shot
orchestration surface without the guided wrapper.

If `workflow auto|run|status|resume` is blocked on a missing writable session, add
`--ensure-wallet-session`. Add `--relay-url <url>` when you want the workflow
command to auto-publish the approval request to the relay and emit relay
status/approve follow-up commands instead of only local callback guidance.

That same recovery path also accepts the wallet-session guardrail flags, so the
workflow can reopen a constrained session instead of a broad default one:

```bash
zk-agent workflow pay --wallet main --to <recipient-address> --amount <amount> --ensure-wallet-session --session-hours 12 --allow-transfer-to <recipient-address>
zk-agent workflow pay --wallet main --to <recipient-address> --amount <amount> --ensure-wallet-session --session-preset intent
```

## 7. Resume blocked or long-running flows

List stored checkpoints:

```bash
zk-agent workflow list
```

Inspect one checkpoint:

```bash
zk-agent workflow show --request-id <id>
```

Check whether it is ready to continue:

```bash
zk-agent workflow status --request-id <id>
```

Ask for the single shortest next step:

```bash
zk-agent workflow next --request-id <id>
```

`workflow auto`, `workflow start`, `workflow status`, `workflow next`,
`workflow resume`, `workflow run`, the intent shortcut commands, and
`zk-agent next --request-id <id>` now also return explicit
`recommendedCommands` in JSON mode. Tokenized workflow outputs additionally
surface `discoverAssets`, `discoverOwnedTokens`, `discoverTokens`, and
`inspectToken`, so agent-driven callers can keep moving without rebuilding
token-registry recovery paths themselves.

The same JSON outputs also include `agentProfile` and `agentFollowup`, so a
caller can see whether the local operator identity is missing, only needs
inspection, or should be relinked to the active wallet.

Resume when ready:

```bash
zk-agent workflow resume --request-id <id> --broadcast
```

## 8. Use direct commands only when you intentionally need them

Examples:

```bash
zk-agent balances --wallet main
zk-agent balances --wallet main --owned-tokens
zk-agent assets --wallet main
zk-agent send --wallet main --to <address> --amount <amount>
zk-agent swap --wallet main [--protocol syncswap-classic] [--token-in <address>|--token-in-symbol <symbol>] [--token-out <address>|--token-out-symbol <symbol>] --amount-in <amount> --amount-out-min <amount>
zk-agent bridge --wallet main --amount <amount> [--to-chain zksync-sepolia]
zk-agent withdraw --wallet main --amount <amount>
zk-agent withdraw-status --wallet main --tx-hash <hash>
zk-agent withdraw-finalize --wallet main --tx-hash <hash>
```

When `--protocol` is omitted, direct `swap` now follows the current
registry-backed validated swap path.

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

To generate a local export directly from this repo's tracked deployment records
you need a source checkout. In that repo-only path, run
`pnpm --filter @zk-agent/paymaster-test-assets export:token-directory` and
point `ZK_AGENT_TOKEN_DIRECTORY_ROOT` at
`packages/paymaster-test-assets/token-directory`.

Inspect discoverable tokens before running a tokenized command:

```bash
zk-agent tokens --chain zksync-sepolia
zk-agent tokens --chain zksync-sepolia --symbol USDC
zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token
zk-agent tokens --chain zksync-sepolia --symbol USDC --source token-directory
zk-agent tokens --wallet main --owned
zk-agent resolve-token --chain zksync-sepolia --symbol USDC
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --role paymaster-fee-token
zk-agent resolve-token --chain zksync-sepolia --symbol USDC --source token-directory
```

Use `assets` as the default single-chain asset entrypoint. Keep
`balances --owned-tokens` for the raw balances surface and `tokens --owned`
for the narrower owned ERC-20 registry subset. Those owned-token surfaces now
also return shared-bridge mapping annotations plus a structured summary of
source counts, bridge-mapping counts, and tracked registry-role counts.

`zk-agent defaults` now also shows that source order and token-directory
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
zk-agent wallet smart-account profiles
```

Predict and deploy the primary built-in profile:

```bash
zk-agent wallet smart-account predict --name main --profile sed-lite
zk-agent wallet smart-account deploy --name main --profile sed-lite
```

The packaged CLI now ships the built-in profile artifacts for these first-party
profiles. `ZK_AGENT_ACCOUNT_PROFILES_ROOT` is only needed when you are running
from a source checkout or a custom runtime layout and want to override where
those artifacts are resolved.

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
pnpm tool:run -- --tool walletReapproveTool --input '{"walletName":"main","policyPreset":"full-access"}'
pnpm tool:run -- --tool workflowOrchestratorTool --input '{"walletName":"main","intent":"send-native","goal":{"intent":"send-native","to":"0x1111111111111111111111111111111111111111","amount":"0.001"},"ensureWalletSession":true,"approvalPolicyPreset":"intent","createCheckpoint":true}'
```

When listing tools with `pnpm tool:run -- --list`, high-frequency entries now
appear first and each item includes a `group` field plus the closest
`cliCommand` equivalent. Key operator-path tools also include `exampleInput`.
Treat `workflowPayTool` as the default flagship native-pay entry.
Use `workflowAutoTool` when the workflow intent is broader than native send.
`workflowOrchestratorTool` remains available as a compatibility alias.

For the default product path, key tools also expose `operatorPathStage`:

- `decide-next`: start from `topLevelNextTool`
- `acquire-session`: wallet create/reapprove/orchestrated approval
- `guided-execution`: `workflowPayTool` by default, `workflowAutoTool` for broader intents
- `funding-fallback`: `workflowFundTool`
- `checkpoint-follow-up`: `workflowStatusByCheckpointTool`, `workflowNextByCheckpointTool`, `workflowRunByCheckpointTool`

Tool-side session guardrails match the CLI presets:

- `walletReapproveTool.policyPreset`
- `workflowOrchestratorTool.approvalPolicyPreset`

The list response also includes a top-level `recommendedSequence`, which
already orders those stages for the default product path.

Preferred root wrappers for the validated product smokes:

```bash
pnpm smoke:discovery -- --wallet <name> [--symbol <symbol>]
pnpm smoke:operator-path -- --wallet <name> [--paymaster-mode none|approval-based|sponsored]
pnpm smoke:product-path -- --wallet <name> [--tx-hash <withdrawTxHash>] [--paymaster-mode approval-based|sponsored]
pnpm smoke:paymaster-success -- --wallet <name>
pnpm validate:phase3
```

Those smoke JSON responses now preserve structured workflow follow-ups:

- `smoke:discovery` validates the real CLI discovery/default inspection path
  across `defaults`, `assets`, `balances --owned-tokens`, `tokens --owned`,
  `tokens --chain`, and `resolve-token`
- `smoke:operator-path` includes `summary.topLevelRecommendedCommands` and
  `summary.workflowRecommendedCommands`, accepts an optional
  `--paymaster-mode` override for the previewed workflow guidance, plus
  `summary.topLevelAgentFollowup` and `summary.workflowAgentFollowup`
- `smoke:product-path` includes per-step `summary.followups` and can switch
  the paymaster validation step between `approval-based` and `sponsored`
- `smoke:paymaster-success` includes `result.recommendedCommands` plus
  `result.agentFollowup`

## Known constraints

- approval-based paymaster mode is not valid for every ERC-20 fee token
- on `zksync-sepolia`, approval-based mode can auto-fill the tracked validated paymaster + EraVM fee-token defaults when only the mode is supplied
- direct remote approval is available through `relay serve` + `wallet create|reapprove --relay-url` + `wallet request approve`, including an encrypted relay-package path, but `--await-local` remains the default path
- sandbox DNS can fail even when the public RPC endpoint is healthy
- for the current product baseline, prefer:
  - `wallet create --await-local`
  - `wallet reapprove --await-local`
  - `wallet next`
  - `wallet status`
  - `workflow pay` for the flagship native-send path
  - `workflow auto` for broader multi-intent flows

For detailed action-path examples, read:

- [zk-defi/SKILL.md](./zk-defi/SKILL.md)
