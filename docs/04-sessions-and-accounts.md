# Sessions and Account Model

## Why this is the missing fourth pillar

If the project only studies the SDK, AA transactions, and paymasters, it still
misses the authorization path that an agent actually depends on.

The most valuable layer in `polygon-agent-cli` is not just the raw command
surface. It is the combination of:

- the CLI
- the browser connector UI
- the shared session, relay, and crypto protocol

In zkSync, that layer must be preserved and arguably matters even more because
zkSync comes with a stronger native account-abstraction model.

## What the local docs confirm

### Session keys / sessions

- The zkSync docs describe sessions as a temporary-key authorization model with
  policies.
- That is a strong match for agent CLI needs: short-lived authorization,
  bounded capability, recoverability, and revocability.

### Accounts

- The local material references zkSync SSO accounts as modular smart-account
  systems and points at ERC-7579.
- That means an account cannot be treated only as "one address plus one private
  key". It may also include modules, validators, policies, and other extension
  points.

## Design implications for `zk-agent-cli`

### Connector UI

Browser approval should not stop at "confirm this address". It also needs room
for future inputs such as:

- session duration
- allowed chains
- allowed actions
- spending limits
- paymaster policy

### Session protocol

Future payload evolution in `agent-session-protocol` should at least be able to
carry:

- account address
- account type
- session public key
- policy summary
- chain scope
- expiry

### Local storage

Local storage should distinguish between:

- the long-lived wallet or account identity
- session-scoped temporary authorization
- pending approval requests and recovery state

Those three categories should not be merged into one opaque blob.

## Identity and reputation assessment

The project goal mentions `agent identity / reputation`. That direction is
reasonable, but the local source set does not currently show an official zkSync
reputation standard that can be copied directly.

So the more accurate current engineering stance is:

- `identity` can start with account identifiers, session signatures, public-key
  linkage, and capability claims
- `reputation`, if it exists, should begin as a plugin or replaceable
  implementation
- the core layer should not invent a fictional "official zkSync reputation
  protocol"

## Current implementation guidance

1. `agent-session-protocol` should remain chain-agnostic.
2. `provider-zksync-wallet` should project zkSync account capabilities into the
   session payload.
3. `plugin-identity` should continue to focus on local profiles, capability
   metadata, and wallet linkage rather than hard-coding a speculative
   reputation model.
