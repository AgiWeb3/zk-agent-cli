# Paymasters

## Why This Is Core

For `zk-agent-cli`, paymaster support is not a convenience feature. It directly affects:

- who actually pays gas
- whether the agent can execute when it has no native ETH
- what must be approved in the session and wallet policy
- how transaction estimation and failure rendering work

Because of that, paymaster behavior belongs in the shared transaction executor, not scattered across individual commands.

## Supported Modes In This Project

### `none`

- Normal zkSync transaction flow.
- The wallet must hold native ETH for gas.
- This is currently the safest baseline for functional testing.

### `sponsored`

- A paymaster covers gas through the General flow.
- This is structurally supported in the provider, but depends on having a valid paymaster address or chain-provided service.

### `approval-based`

- The wallet approves an ERC-20 token for fee payment.
- The paymaster then uses that token allowance to cover gas.
- This is the most important mode for agent UX, but also the easiest one to misunderstand.

## Important Lesson From Sepolia Testing

The most important practical finding so far is:

**Not every standard ERC-20 is automatically usable as a paymaster fee token.**

What we verified on `zkSync Sepolia`:

- `send-token` preview with `--paymaster-mode none` works with the configured test token.
- The same `send-token` path with `--paymaster-mode approval-based` can fail during paymaster validation.
- The chain-side error we observed was:
  - `ERC20: transfer amount exceeds balance`

This matters because it proves a real boundary:

- A token can be a perfectly valid ERC-20 for transfers.
- That same token can still be unsuitable for the current paymaster fee path.

So the distinction is not simply:

- "standard ERC-20" vs "non-standard ERC-20"

The real distinction is:

- "usable as a normal token transfer target"
- "usable as a paymaster fee token under the current paymaster's rules"

## Latest Sepolia Status

We have now validated two different stages of the `approval-based` path on `zkSync Sepolia`:

1. A previously configured token worked for ordinary ERC-20 transfers but failed paymaster estimation.
2. A self-deployed `18 decimals` test token fixed that estimation problem.

That means:

- fee-token compatibility is real
- token decimals / raw units matter in practice for the testnet paymaster flow
- the original paymaster failure was not just "our CLI is wrong"

But there is a second boundary after estimation:

- approval-based preview / estimation now succeeds with the self-deployed token
- real broadcast still fails during transaction validation

The concrete broadcast rejection is:

- `Touched disallowed storage slots: address 0x000000000000000000000000000000000000800b, key: 1`

From the local `zksync-docs` set in this workspace:

- `0x...800b` is the `SystemContext` system contract

Our current interpretation is:

- this strongly suggests the approval-based live validation path is sensitive to
  fee-token implementation details, not just token address or decimals
- this is still an interpretation, not a fully confirmed root cause
- the important confirmed facts are now:
  - approval-based paymaster on Sepolia is preview-validated
  - sponsored/general paymaster live broadcast succeeds with the same custom paymaster
  - approval-based paymaster live broadcast succeeds once the fee token is also
    deployed as native EraVM bytecode
  - the older EVM-interpreter token path is still not broadcast-stable in this
    repository

## What The Testnet Paymaster Actually Cares About

For `approval-based` flow, the paymaster validates more than ABI compatibility.

It cares about:

- the selected fee token address
- the computed `minimalAllowance`
- whether the account balance can satisfy the paymaster-side transfer logic
- the paymaster's own assumptions about fee-token handling on that chain

This means the business transfer amount is not the right mental model.

Even if the user only wants to transfer a tiny token amount, the paymaster may require a much larger token allowance or balance for gas settlement.

## Current Engineering Interpretation

At the current stage of `zk-agent-cli`, we should treat `approval-based` paymaster support as:

- a transaction capability that must be validated per chain
- a fee-token compatibility problem, not just a token-registry problem
- a preview-path success that still does not guarantee broadcast-path success for
  every fee-token implementation
- something that needs explicit errors and explicit documentation

We should **not** assume:

- any ERC-20 on `zkSync Sepolia` can be used for the testnet paymaster
- a familiar token symbol like `USDC` is sufficient proof of compatibility
- successful token transfer preview implies successful paymaster fee usage

## Practical Guidance For Testing

Use these rules for now:

1. If the goal is to test basic transaction assembly, use `--paymaster-mode none`.
2. If the goal is to test `approval-based` paymaster, only use a token that has been explicitly validated for that paymaster path.
3. If a token works for transfer but fails for paymaster estimation, treat that as fee-token incompatibility until proven otherwise.
4. If approval-based preview succeeds but broadcast fails, treat that as a separate validation-stage blocker.
5. Prefer deterministic test tokens and explicit docs over informal assumptions like "this looks like Sepolia USDC, so it should work".

## What The CLI Should Communicate Clearly

The CLI should make these facts visible:

- whether paymaster mode came from the session or the command override
- which token is being used for approval-based flow
- what `minimalAllowance` was estimated
- whether the failure came from base transaction estimation or paymaster validation
- whether the failure happened during preview / estimation or during real broadcast

This is especially important for agent usage, because an LLM cannot recover from vague fee errors unless the failure mode is structured and explicit.

## Current Project Stance

Our current stance should stay conservative:

- paymaster support is first-class
- paymaster implementation is provider-specific
- fee-token compatibility must be validated, not guessed
- preview success and broadcast success must be tracked separately
- testnet paymaster behavior should be documented from real execution results

That is stricter than a generic "supports paymasters" claim, but it is much more honest and much more useful.
