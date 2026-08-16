# Operator JSON Contract

This document only describes the machine-readable outputs that are already
implemented, already covered by tests, and intended for operators or agent
harnesses.

The goal is not to restate every JSON payload field by field. The goal is to
stabilize the most important contracts on the default product path.

## Scope

The following outputs should currently be treated as the default operator
contract:

- `zk-agent defaults`
- `zk-agent assets`
- `zk-agent balances --owned-tokens`
- `zk-agent tokens`
- `zk-agent resolve-token`
- `zk-agent next`
- `zk-agent relay serve`
- `zk-agent relay inspect`
- `zk-agent wallet next`
- `zk-agent wallet create --relay-url <url>`
- `zk-agent wallet reapprove --name <name> --relay-url <url>`
- `zk-agent wallet request relay-publish`
- `zk-agent wallet request relay-status`
- `zk-agent workflow plan`
- `zk-agent workflow start`
- `zk-agent workflow auto`
- `zk-agent workflow status`
- `zk-agent workflow next`
- `zk-agent workflow run`
- `zk-agent workflow resume`
- `zk-agent workflow list|show|update|delete`
- `zk-agent agent status|show`
- `pnpm smoke:operator-path`
- `pnpm smoke:product-path`
- `pnpm smoke:paymaster-success`
- `pnpm tool:run -- --list`

## Shared fields

### `ok`

All of these surfaces return top-level `ok: true|false`.

### `agentProfile`

Surfaces on the default operator path now return a summary of the local agent
identity state.

Field shape:

```json
{
  "profileExists": true,
  "status": "present",
  "agentId": "sed-operator",
  "name": "SED Operator",
  "activeWalletName": "main",
  "linkedWalletName": "main",
  "walletRelation": "linked-active-wallet",
  "tagCount": 1,
  "capabilityCount": 1,
  "metadataKeyCount": 1
}
```

Current stable semantics:

- `profileExists`
  Whether local `~/.zk-agent/agent/profile.json` exists.
- `status`
  Currently only `missing` or `present`.
- `walletRelation`
  Current stable values:
  - `missing`
  - `unlinked`
  - `linked-active-wallet`
  - `linked-other-wallet`

### `agentFollowup`

This is the local agent-identity follow-up companion to `agentProfile`. It is
not mixed into workflow or wallet execution follow-ups.

Field shape:

```json
{
  "status": "zk-agent agent status --wallet main",
  "show": "zk-agent agent show",
  "set": "zk-agent agent set --name <name> --wallet main",
  "linkWallet": "zk-agent agent set --wallet main",
  "nextAction": "zk-agent agent show"
}
```

Notes:

- `show`, `set`, and `linkWallet` appear selectively depending on context.
- `nextAction` is the default recommendation within this follow-up set.
- `agentFollowup` does not replace `recommendedCommands`; it only describes the
  local agent-identity dimension.

## `zk-agent next`

`zk-agent next` is the default top-level routing contract.

### Shared fields

- `scope`
- `nextCommand`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

### `scope = "setup"`

This means local config is missing.

Key fields:

```json
{
  "scope": "setup",
  "status": "action-required",
  "nextCommand": "zk-agent setup",
  "recommendedCommands": {
    "setup": "zk-agent setup",
    "afterSetup": "zk-agent next",
    "inspectDefaults": "zk-agent defaults"
  }
}
```

### `scope = "wallet-bootstrap"`

This means config exists, but the target wallet does not.

Key fields:

```json
{
  "scope": "wallet-bootstrap",
  "walletName": "main",
  "nextCommand": "zk-agent wallet create --await-local",
  "recommendedCommands": {
    "createWallet": "zk-agent wallet create --await-local",
    "relayInspect": "zk-agent relay inspect --relay-url <url>",
    "createWalletRemote": "zk-agent wallet create --relay-url <url> --wait-relay --prompt-code",
    "afterApproval": "zk-agent next",
    "inspectDefaults": "zk-agent defaults"
  }
}
```

### `scope = "wallet"`

This means a local wallet record already exists and the recommended next step
is now at the wallet or workflow layer.

When the wallet is writable and there is no narrower blocker, the default
flagship next step now points to `workflow pay`, while `workflowAuto` remains
available for broader multi-intent guided execution.

When that flagship path stays on the default approval-based paymaster mode, the
same wallet-scope follow-up contract also surfaces the paymaster fee-token
recovery commands directly instead of forcing the operator back into generic
token discovery.

Key fields:

```json
{
  "scope": "wallet",
  "walletName": "main",
  "inspection": { "...": "wallet inspection payload" },
  "summary": { "...": "wallet next summary payload" },
  "tokenDiscoverySummary": { "...": "wallet-scope token recovery summary" },
  "nextCommand": "zk-agent workflow pay --wallet main --to <address> --amount <amount>",
  "recommendedCommands": {
    "walletNext": "zk-agent wallet next --name main",
    "walletStatus": "zk-agent wallet status --name main",
    "discoverAssets": "zk-agent assets --wallet main",
    "discoverOwnedTokens": "zk-agent tokens --wallet main --owned",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>",
    "discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token",
    "inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol> --role paymaster-fee-token",
    "workflowPay": "zk-agent workflow pay --wallet main --to <address> --amount <amount>",
    "workflowAuto": "zk-agent workflow auto --wallet main --intent <intent> [goal flags] --create-checkpoint --execute-when-ready",
    "nextAction": "zk-agent workflow pay --wallet main --to <address> --amount <amount>"
  }
}
```

When the wallet scope exposes token/discovery follow-ups, `tokenDiscoverySummary`
compresses that routing contract into:

- `walletName`
- `chain`
- `intent`
- `nextAction`
- `paymasterMode`
- `tokenizedIntent`
- `includesAssetDiscovery`
- `includesOwnedTokenDiscovery`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `includesPaymasterTokenDiscovery`
- `includesPaymasterTokenInspection`

### `scope = "workflow"`

This means the result is a workflow follow-up restored from `--request-id`.

Key fields:

```json
{
  "scope": "workflow",
  "requestId": "wf123456",
  "workflowRequestId": "wf123456",
  "walletName": "main",
  "nextCommand": "zk-agent workflow resume --request-id wf123456",
  "tokenDiscoverySummary": { "...": "workflow-scope token recovery summary" },
  "result": { "...": "workflow status payload" },
  "checkpoint": { "...": "stored checkpoint payload" }
}
```

When the restored workflow intent is tokenized, `tokenDiscoverySummary` uses
the same field set described for wallet scope.

## `zk-agent wallet next`

`zk-agent wallet next` is the wallet-layer remediation and routing contract
that top-level `zk-agent next` reuses after local setup and wallet bootstrap
are already complete.

Current stable top-level fields:

- `ok`
- `inspection`
- `summary`
- `tokenDiscoverySummary`
- `recommendedCommands`

Within that set:

- `inspection`
  The detailed wallet inspection payload for approval, signer, deployment, and
  local execution readiness.
- `summary`
  The compressed wallet-remediation summary with current actions, notes, and
  the preferred wallet-layer next step.
- `recommendedCommands`
  The wallet-scoped remediation and discovery follow-up contract that can also
  point onward into the flagship workflow path.

When wallet-scoped discovery follow-ups are present, `tokenDiscoverySummary`
uses the same field set described for top-level `zk-agent next` wallet scope:

- `walletName`
- `chain`
- `intent`
- `nextAction`
- `paymasterMode`
- `tokenizedIntent`
- `includesAssetDiscovery`
- `includesOwnedTokenDiscovery`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `includesPaymasterTokenDiscovery`
- `includesPaymasterTokenInspection`

## `zk-agent workflow *`

### `workflow plan`

The most important fields in the current contract are:

- `agentProfile`
- `agentFollowup`
- `inspection`
- `plan`
- `tokenDiscoverySummary`
- `recommendedCommands`

On the plan surface, `recommendedCommands` is the default container for
bridge/swap/token follow-ups. It is not the agent-identity follow-up container.

When the current intent is tokenized, `tokenDiscoverySummary` compresses the
workflow-scoped token recovery path into:

- `walletName`
- `chain`
- `intent`
- `nextAction`
- `paymasterMode`
- `tokenizedIntent`
- `includesAssetDiscovery`
- `includesOwnedTokenDiscovery`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `includesPaymasterTokenDiscovery`
- `includesPaymasterTokenInspection`

### `workflow start`

Key fields:

- `workflowRequestId`
- `checkpoint`
- `status`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`

### `workflow auto`

This is the current default guided-execution contract.

Key fields:

- `source`
- `action`
- `checkpointPersisted`
- `workflowRequestId`
- `status`
- `result`
- `checkpoint`
- `walletApproval`
- `tokenDiscoverySummary`
- `recommendedCommands`
- `agentProfile`
- `agentFollowup`

Two follow-up groups must be distinguished here:

- `recommendedCommands`
  The next step at the current workflow/action layer.
- `agentFollowup`
  The next step at the current local agent-identity layer.

### `workflow status|next|run|resume`

These surfaces currently all include:

- `agentProfile`
- `agentFollowup`
- `tokenDiscoverySummary`
- `recommendedCommands`

Within that set:

- `workflow next`
  additionally includes a simplified `summary`
- `workflow run`
  includes `result` on successful execution
- `workflow resume`
  first verifies whether the checkpoint can actually be resumed

Tokenized workflow outputs should keep the same local-first recovery contract
visible:

- `discoverAssets`
- `discoverOwnedTokens`
- `discoverTokens`
- `inspectToken`
- `discoverPaymasterTokens`
- `inspectPaymasterToken`

Current stable `tokenDiscoverySummary` fields on tokenized workflow surfaces:

- `walletName`
- `chain`
- `intent`
- `nextAction`
- `paymasterMode`
- `tokenizedIntent`
- `includesAssetDiscovery`
- `includesOwnedTokenDiscovery`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `includesPaymasterTokenDiscovery`
- `includesPaymasterTokenInspection`

When the current workflow intent is not tokenized, `tokenDiscoverySummary` may
be absent.

### Token-input workflow errors

When `workflow status|next|run|resume|auto` fails during token input
resolution, the error payload now also includes:

- `recommendedCommands`
- `tokenDiscoverySummary`

Current stable `tokenDiscoverySummary` fields on that error path:

- `chain`
- `queryType`
- `query`
- `roleFilter`
- `includesChainTokenDiscovery`
- `includesDirectTokenInspection`
- `workflowHelp`

### `workflow list|show|update|delete`

These checkpoint-management surfaces now also include:

- `agentProfile`
- `agentFollowup`

That keeps the agent-identity context available even when the harness moves
into checkpoint-management commands.

## `zk-agent relay serve`

This is the local hosted-relay startup surface.

Current stable top-level fields:

- `ok`
- `status`
- `origin`
- `publicOrigin`
- `publicOriginSource`
- `stateBackend`
- `deploymentScope`
- `sameHostRestartPersists`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `publicOriginLooksLocal`
- `deploymentSummary`
- `healthUrl`
- `publicHealthUrl`
- `relayMode`
- `connectorUiAvailable`
- `hostedShareRedirectReady`
- `capabilities`
- `recommendedCommands`
- `notes`

When present, `deploymentSummary` compresses the hosted deployment contract
into:

- `origin`
- `publicOrigin`
- `publicOriginSource`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `publicOriginConfigured`
- `publicOriginLooksLocal`
- `connectorUiAvailable`
- `hostedShareRedirectReady`
- `singleHostFileState`

## `zk-agent relay inspect`

This is the hosted-relay compatibility and deployment-inspection surface.

Current stable top-level fields:

- `ok`
- `status`
- `relayUrl`
- `compatible`
- `origin`
- `publicOrigin`
- `publicOriginSource`
- `stateBackend`
- `deploymentScope`
- `sameHostRestartPersists`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `relayUrlMatchesOrigin`
- `relayUrlMatchesPublicOrigin`
- `publicOriginLooksLocal`
- `deploymentSummary`
- `connectorUiAvailable`
- `hostedShareRedirectReady`
- `capabilities`
- `recommendedCommands`
- `notes`

Current stable `deploymentSummary` fields on this surface:

- `origin`
- `publicOrigin`
- `publicOriginSource`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `publicOriginConfigured`
- `publicOriginLooksLocal`
- `connectorUiAvailable`
- `hostedShareRedirectReady`
- `singleHostFileState`

## `zk-agent wallet create --relay-url <url>`

This is the higher-level remote wallet-bootstrap publish surface.

Current stable top-level fields:

- `ok`
- `walletName`
- `requestId`
- `walletRequestId`
- `approvalUrl`
- `relay`
- `relayRecoverySummary`
- `expiresAt`
- `chain`
- `chainId`
- `accountKind`
- `paymasterMode`
- `capabilities`
- `sessionScope`
- `nextAction`
- `recommendedCommands`

Current stable `recommendedCommands` shape on this surface:

- `awaitLocal`
- `relayStatus`
- `relayApprove`
- `approve`
- `afterApproval`
- `afterApprovalStatus`

Current stable `relayRecoverySummary` fields on this surface:

- `requestId`
- `walletName`
- `relayUrl`
- `relayStatus`
- `approvalReady`
- `nextAction`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `recoveryMode`
- `includesStatusPoll`
- `includesApprove`
- `includesRelayInspect`
- `includesRemoteReissue`

Current stable semantics:

- `nextAction`
  Defaults to `zk-agent wallet request relay-status --request-id <id> --relay-url <url>`
  immediately after publish.
- `recommendedCommands.relayApprove`
  Preserves the lower-level manual finalize path even when the operator starts
  from the higher-level wallet-create entrypoint.

## `zk-agent wallet reapprove --name <name> --relay-url <url>`

This is the higher-level remote existing-wallet reapproval publish surface.

Current stable top-level fields:

- `ok`
- `walletRequestId`
- `wallet`
- `request`
- `relay`
- `relayRecoverySummary`
- `nextAction`
- `recommendedCommands`

Current stable `recommendedCommands` shape on this surface:

- `awaitLocal`
- `relayStatus`
- `relayApprove`
- `approve`
- `afterApproval`
- `afterApprovalStatus`

Current stable `relayRecoverySummary` fields on this surface:

- `requestId`
- `walletName`
- `relayUrl`
- `relayStatus`
- `approvalReady`
- `nextAction`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `recoveryMode`
- `includesStatusPoll`
- `includesApprove`
- `includesRelayInspect`
- `includesRemoteReissue`

Current stable semantics:

- `request`
  Preserves the pending reapproval request metadata that the higher-level
  entrypoint generated before relay publication.
- `nextAction`
  Defaults to `zk-agent wallet request relay-status --request-id <id> --relay-url <url>`
  immediately after publish.

## `zk-agent wallet request relay-publish`

This is the lower-level hosted relay/manual-approval publish surface.

Current stable top-level fields:

- `ok`
- `walletRequestId`
- `relay`
- `relayRecoverySummary`
- `request`
- `recommendedCommands`
- `nextAction`

Current stable `relayRecoverySummary` fields on this surface:

- `requestId`
- `walletName`
- `relayUrl`
- `relayStatus`
- `approvalReady`
- `nextAction`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `recoveryMode`
- `includesStatusPoll`
- `includesApprove`
- `includesRelayInspect`
- `includesRemoteReissue`

## `zk-agent wallet request relay-status`

This is the lower-level hosted relay/manual-approval status surface.

Current stable top-level fields:

- `ok`
- `walletRequestId`
- `relay`
- `relayRecoverySummary`
- `recommendedCommands`
- `nextAction`
- `note`

Current stable `relay` fields:

- `request_id`
- `status`
- `approval_ready`
- `share_url`
- `status_url`
- `approval_url`
- `expires_at`

Current stable `relayRecoverySummary` fields on this surface:

- `requestId`
- `walletName`
- `relayUrl`
- `relayStatus`
- `approvalReady`
- `nextAction`
- `shareLinkBaseUrl`
- `statusApiBaseUrl`
- `recoveryMode`
- `includesStatusPoll`
- `includesApprove`
- `includesRelayInspect`
- `includesRemoteReissue`

When `status = ready`, `nextAction` points at:

- `zk-agent wallet request approve --request-id <id> --relay-url <url> --code <code> --wait`

When `status = expired`, `nextAction` stops self-polling and instead points at
remote request reissue.

Key expired-shape example:

```json
{
  "ok": true,
  "walletRequestId": "req12345",
  "relay": {
    "request_id": "req12345",
    "status": "expired",
    "approval_ready": false,
    "share_url": "https://relay.example.com/r/req12345",
    "status_url": "https://relay.example.com/api/requests/req12345",
    "approval_url": "https://relay.example.com/r/req12345",
    "expires_at": "2026-08-10T00:05:00.000Z"
  },
  "recommendedCommands": {
    "relayInspect": "zk-agent relay inspect --relay-url https://relay.example.com",
    "reissueRemoteApproval": "zk-agent wallet reapprove --name main --relay-url https://relay.example.com --wait-relay --prompt-code"
  },
  "nextAction": "zk-agent wallet reapprove --name main --relay-url https://relay.example.com --wait-relay --prompt-code",
  "note": "Relay approval expired. Reissue the remote request. If the original request used scoped session flags, add those same policy flags again."
}
```

Current stable semantics:

- `recommendedCommands.relayInspect`
  Inspect the hosted relay contract again before retrying when deployment state
  is in doubt.
- `recommendedCommands.reissueRemoteApproval`
  The default remote retry path after expiry.
- `nextAction`
  The single best executable next step for the current relay state.

The same `relayRecoverySummary` field set now also appears in:

- `wallet create --relay-url <url>`
- `wallet reapprove --name <name> --relay-url <url>`
- `wallet request relay-publish`
- `RELAY_APPROVAL_TIMEOUT` error details
- `RELAY_APPROVAL_EXPIRED` error details

## The role of `recommendedCommands`

In the current contract, `recommendedCommands` remains the main container for
action/path follow-ups.

Its contents vary by surface, but the semantics are now stable:

- executable next steps such as wallet/workflow/defaults/token-discovery
- not agent-identity-specific meaning

So the current contract layering is:

- `recommendedCommands`
  execution-path follow-ups
- `agentFollowup`
  local agent-identity follow-ups

## `zk-agent defaults`

`zk-agent defaults` is the machine-readable defaults and discovery catalog for
the current validated product path.

Current stable top-level fields:

- `ok`
- `summary`
- `recommendedCommands`
- `defaults`
- `localTokenRegistry`
- `tokenRegistrySources`
- `tokenDirectoryChains`

### `recommendedCommands`

The current stable discovery follow-up contract is:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT",
    "discoverPaymasterTokens": "zk-agent tokens --chain zksync-sepolia --role paymaster-fee-token",
    "inspectPaymasterToken": "zk-agent resolve-token --chain zksync-sepolia --symbol ZKAT --role paymaster-fee-token"
  }
}
```

Current stable semantics:

- `inspectDefaults`
  Reopen the registry/defaults catalog directly.
- `discoverTokens`
  Start the symbol-first chain token discovery path from the current primary
  chain.
- `inspectToken`
  Inspect one concrete token symbol on that same primary discovery chain.
- `discoverPaymasterTokens`
  Narrow discovery to tokens that are valid for approval-based paymaster fees.
- `inspectPaymasterToken`
  Inspect one concrete paymaster-fee-token candidate on the primary discovery
  chain.

### `summary`

The current stable `summary` fields are:

- `primaryDiscoveryChain`
- `exampleTokenSymbol`
- `paymasterFeeTokenSymbol`
- `localTokenCount`
- `tokenDirectoryChainCount`
- `tokenRegistrySources`
- `resolvedDefaults`

Example shape on the current validated Sepolia path:

```json
{
  "summary": {
    "primaryDiscoveryChain": "zksync-sepolia",
    "exampleTokenSymbol": "ZKAT",
    "paymasterFeeTokenSymbol": "ZKAT",
    "localTokenCount": 3,
    "tokenDirectoryChainCount": 0,
    "tokenRegistrySources": [
      {
        "id": "local-deployments",
        "enabled": true,
        "exists": true
      }
    ],
    "resolvedDefaults": {
      "swap": {
        "entryId": "syncswap-classic",
        "chain": "zksync-sepolia",
        "protocol": "syncswap-classic",
        "status": "validated"
      },
      "bridgeDeposit": {
        "entryId": "ethereum-sepolia-to-zksync-sepolia",
        "fromChain": "ethereum-sepolia",
        "toChain": "zksync-sepolia",
        "status": "validated"
      },
      "bridgeWithdraw": {
        "entryId": "zksync-sepolia-to-ethereum-sepolia",
        "fromChain": "zksync-sepolia",
        "toChain": "ethereum-sepolia",
        "status": "validated",
        "requiresFinalize": true
      },
      "paymasterDefault": {
        "entryId": "zksync-sepolia-approval-based-eravm",
        "chain": "zksync-sepolia",
        "mode": "approval-based",
        "status": "validated"
      },
      "paymasterByMode": {
        "none": "zksync-sepolia-no-paymaster",
        "sponsored": "zksync-sepolia-sponsored",
        "approvalBased": "zksync-sepolia-approval-based-eravm"
      }
    }
  }
}
```

Current stable semantics:

- `primaryDiscoveryChain`
  The one chain that downstream discovery flows should prefer by default.
- `exampleTokenSymbol`
  The current concrete symbol used for symbol-first discovery follow-ups.
- `paymasterFeeTokenSymbol`
  The current concrete symbol used for approval-based paymaster fee-token
  follow-ups, or `null` when no validated candidate exists.
- `localTokenCount`
  Count of locally indexed token entries shipped with the repo/runtime.
- `tokenDirectoryChainCount`
  Count of indexed token-directory chains available locally to the CLI.
- `tokenRegistrySources`
  The enabled/existing source-state summary for the merged token registry.
- `resolvedDefaults`
  The compressed swap/bridge/paymaster defaults that the flagship product path
  currently resolves to.

## `zk-agent assets`

`zk-agent assets` is the preferred single-chain asset entrypoint on the
current product path.

Current stable top-level fields:

- `ok`
- `discoverySummary`
- `recommendedCommands`
- `walletName`
- `walletAddress`
- `chain`
- `chainId`
- `balances`
- `ownedTokenRegistry`

### `recommendedCommands`

Current stable discovery follow-up shape:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverOwnedTokens": "zk-agent tokens --wallet main --owned",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"
  }
}
```

### `discoverySummary`

Current stable fields:

- `walletName`
- `chain`
- `chainId`
- `assetCount`
- `nativeAssetSymbol`
- `nativeAssetBalance`
- `ownedTokenCount`
- `primaryOwnedTokenSymbol`
- `ownedTokenSymbols`
- `ownedTokenSourceCounts`
- `ownedBridgeMappingCounts`
- `ownedRegistryRoleCounts`

Current stable semantics:

- `assetCount`
  Count of entries in the merged single-chain asset view, including native
  balance plus registry-backed owned ERC-20 balances.
- `ownedTokenCount`
  Count of owned registry-backed ERC-20 entries in the same asset view.
- `primaryOwnedTokenSymbol`
  The first concrete owned token symbol exposed by this asset view, or `null`
  when none are currently held.
- `ownedTokenSourceCounts`
  Compressed source counts for the owned ERC-20 subset.
- `ownedBridgeMappingCounts`
  Compressed shared-bridge mapping status counts for the owned ERC-20 subset.
- `ownedRegistryRoleCounts`
  Compressed defaults-registry role counts for the owned ERC-20 subset.

## `zk-agent balances --owned-tokens`

When `zk-agent balances` stays on the single-chain path and `--owned-tokens`
is enabled, it now exposes the same discovery follow-up contract as
`zk-agent assets`.

Current stable top-level fields on that path:

- `ok`
- `discoverySummary`
- `recommendedCommands`
- `walletName`
- `walletAddress`
- `chain`
- `chainId`
- `balances`
- `ownedTokenRegistry`

Current stable semantics:

- `discoverySummary`
  Same compressed single-chain owned-token summary contract as `zk-agent assets`.
- `recommendedCommands`
  Same local-first discovery follow-up contract as `zk-agent assets`.

## `zk-agent tokens`

`zk-agent tokens` is the symbol-first discovery surface for either:

- chain-scoped discoverable tokens
- wallet-scoped owned registry-backed ERC-20 tokens via `--owned`

Current stable top-level fields:

- `ok`
- `discoverySummary`
- `recommendedCommands`
- `tokenRegistrySources`
- `entries`
- `entryCount`

Additional current stable top-level fields depend on mode:

- chain discovery:
  - `chainFilter`
  - `symbol`
  - `role`
  - `source`
- owned discovery:
  - `walletName`
  - `walletAddress`
  - `ownedOnly`
  - `chainFilter`
  - `symbol`
  - `role`
  - `source`
  - `summary`
  - `probeFailureCount`
  - `probeFailures`

Important current distinction:

- `discoverySummary`
  The compressed operator-facing summary contract added by the CLI surface.
- `summary`
  On `tokens --owned`, the existing detailed owned-token probe summary from the
  underlying registry path. This is preserved and not replaced.

### `recommendedCommands`

Current stable chain-discovery shape:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"
  }
}
```

Current stable owned-token shape:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverAssets": "zk-agent assets --wallet main",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia",
    "inspectToken": "zk-agent resolve-token --chain zksync-sepolia --symbol <symbol>"
  }
}
```

### `discoverySummary`

Current stable fields:

- `mode`
- `walletName`
- `chainScope`
- `chainCount`
- `entryCount`
- `symbolFilter`
- `roleFilter`
- `sourceFilter`
- `primarySymbol`
- `primarySource`
- `sourceCounts`
- `roleMatchCounts`
- `currentDefaultEntryCount`
- `probeFailureCount`
- `bridgeMappingCounts`
- `tokenRegistrySources`

Current stable semantics:

- `mode`
  Currently `discoverable` or `owned-registry-erc20`.
- `chainScope`
  The active chain key when discovery is narrowed to one chain, otherwise
  `all-built-in-chains`.
- `primarySymbol`
  The first concrete symbol surfaced by the current token query, or `null`
  when the query is empty.
- `sourceCounts`
  Compressed token-source counts across the returned entries.
- `roleMatchCounts`
  Compressed defaults-registry role-match counts across the returned entries.
- `currentDefaultEntryCount`
  Count of returned entries that match at least one current validated default.
- `probeFailureCount`
  On `tokens --owned`, the count of ERC-20 probe failures; otherwise `null`.
- `bridgeMappingCounts`
  On `tokens --owned`, the compressed shared-bridge mapping status counts;
  otherwise `null`.

## `zk-agent resolve-token`

`zk-agent resolve-token` is the direct token inspection surface after the
candidate set is already known.

Current stable top-level fields:

- `ok`
- `discoverySummary`
- `recommendedCommands`
- `chainId`
- `chainKey`
- `queryType`
- `symbol`
- `address`
- `role`
- `source`
- `matchCount`
- `ambiguous`
- `primaryMatch`
- `matches`
- `tokenRegistrySources`

### `recommendedCommands`

Current stable follow-up shape:

```json
{
  "recommendedCommands": {
    "inspectDefaults": "zk-agent defaults",
    "discoverTokens": "zk-agent tokens --chain zksync-sepolia --symbol USDC"
  }
}
```

### `discoverySummary`

Current stable fields:

- `chain`
- `chainId`
- `queryType`
- `query`
- `roleFilter`
- `sourceFilter`
- `matchCount`
- `ambiguous`
- `primarySymbol`
- `primaryAddress`
- `primaryDecimals`
- `primarySource`
- `sourceCounts`
- `roleMatchCounts`
- `currentDefaultEntryCount`
- `tokenRegistrySources`

Current stable semantics:

- `query`
  The concrete symbol or address that the command inspected on the active
  chain.
- `primary*`
  The compressed identity of the preferred match when at least one match
  exists.
- `sourceCounts`
  Compressed source counts across the returned matches.
- `roleMatchCounts`
  Compressed defaults-registry role-match counts across the returned matches.
- `currentDefaultEntryCount`
  Count of returned matches that align with at least one current validated
  default.

## `zk-agent agent *`

The local operator-identity commands are also part of the machine-readable
contract.

### `agent status|show`

These surfaces currently include:

- `ok`
- `plugin`
- `profileExists`
- `profile`
- `recommendedCommands`

For `agent status`, an optional `inspectedWallet` may also be present.

Key fields:

```json
{
  "ok": true,
  "profileExists": false,
  "profile": null,
  "recommendedCommands": {
    "status": "zk-agent agent status",
    "show": "zk-agent agent show",
    "export": "zk-agent agent export",
    "import": "zk-agent agent import --payload @agent-profile.json",
    "set": "zk-agent agent set --name <name> --wallet main"
  }
}
```

Current stable semantics:

- `profileExists`
  Whether a local profile is already saved.
- `profile`
  `null` when no local profile exists; otherwise the saved local profile.
- `recommendedCommands`
  The local agent-identity follow-up set for create, inspect, export, and
  import paths.

### `agent export|set|import|clear`

These surfaces also keep `recommendedCommands` as the main follow-up
container, with command-specific payloads such as:

- `export`
  portable local profile bundle
- `profile`
  saved profile after `set` or `import`
- `removed`
  whether `clear` actually removed a saved profile

## `pnpm tool:run -- --list`

This is the current agent-tools discoverability contract.

### Top-level fields

- `ok`
- `tools`
- `recommendedSequence`

### `tools[]`

Current stable fields:

- `name`
- `description`
- `group`
- `cliCommand`
- `exampleInput`
- `operatorPathStage`
- `recommended`
- `aliasOf`

Where:

- `cliCommand`
  Gives the closest CLI-equivalent entrypoint so the tool surface stays aligned
  with the human command surface.
- `exampleInput`
  Currently covers the default operator path and most commonly used non-zero
  input tools so the harness does not have to guess input shapes. Zero-input
  or reserialization-heavy tools may omit it.
- `operatorPathStage`
  Current stable values:
  - `decide-next`
  - `acquire-session`
  - `guided-execution`
  - `funding-fallback`
  - `checkpoint-follow-up`
- `recommended`
  Currently used mainly to mark `workflowAutoTool` as the default guided
  workflow entry.
- `aliasOf`
  Currently used to express compatibility aliases explicitly, such as
  `workflowOrchestratorTool -> workflowAutoTool`.

### `recommendedSequence`

This compresses the default operator path into a machine-readable stage
sequence.

Current stable fields on each item:

- `stage`
- `summary`
- `primaryToolName`
- `toolNames`

Current stable stage order:

1. `decide-next`
2. `acquire-session`
3. `guided-execution`
4. `funding-fallback`
5. `checkpoint-follow-up`

### Current session-guardrail discoverability convention

Session-recovery tools on the default operator path now expose preset usage
through `exampleInput` instead of forcing external harnesses to infer it:

- `walletReapproveTool.exampleInput.policyPreset`
- `workflowAutoTool.exampleInput.approvalPolicyPreset`
- `workflowOrchestratorTool.exampleInput.approvalPolicyPreset`

The semantics of `approvalPolicyPreset = "intent"` are also now fixed:
derive the narrowest default session from the workflow goal.

## Smoke contract

### `smoke:operator-path`

The current `summary` is fixed to include:

- `topLevelScope`
- `topLevelNextCommand`
- `topLevelAgentProfile`
- `topLevelAgentFollowup`
- `topLevelRecommendedCommands`
- `walletNextCommand`
- `workflowAction`
- `workflowStage`
- `workflowRegistry`
- `workflowNextCommand`
- `workflowAgentProfile`
- `workflowAgentFollowup`
- `walletApprovalRecommendedCommands`
- `workflowRecommendedCommands`

The purpose of this summary is to compress "top-level routing + guided workflow
execution" into one machine-readable product-path snapshot.

### `smoke:paymaster-success`

The current `result` is fixed to include:

- `stage`
- `goalMode`
- `txHash`
- `agentProfile`
- `agentFollowup`
- `registry`
- `paymaster`
- `nextCommand`
- `recommendedCommands`
- `notes`

### `smoke:product-path`

The most important fields in the current `summary` are:

- `nextCommands`
- `followups`

`followups.<stepId>` can now include:

- `nextCommand`
- `recommendedCommands`
- `registry`
- `agentProfile`
- `agentFollowup`
- `workflowAgentProfile`
- `workflowAgentFollowup`

In other words, the aggregate smoke now preserves not only the execution path
but also the agent-identity layer.

## Current stability boundary

The following field semantics can currently be treated as relatively stable:

- `ok`
- `scope`
- `workflowRequestId`
- `agentProfile`
- `agentFollowup`
- `recommendedCommands`
- `tools[].group`
- `tools[].cliCommand`
- `tools[].exampleInput`
- `tools[].operatorPathStage`
- `recommendedSequence`
- smoke-summary `topLevel*`, `workflow*`, and `followups`

The following payloads should not yet be treated as a permanently stable strong
schema:

- full `inspection` detail
- all nested fields inside `status`, `result`, or `checkpoint`
- the full deep provider/path structure inside `registry`

The more accurate consumption pattern is:

1. first use the top-level routing/follow-up fields to determine the next step
2. then consume `status`, `result`, `checkpoint`, or `registry` details only as
   needed

## Guidance for external harnesses

If you consume these outputs outside the repository, the current recommended
order is:

1. check `ok` first
2. then inspect `scope` or `action`
3. prefer the most relevant command from `agentFollowup.nextAction` or
   `recommendedCommands`
4. only parse `status`, `result`, or `registry` deeply when explanation is
   actually needed

That minimizes coupling to internal provider detail.
