# Compact USDM Settlement Module

This directory contains the Midnight application layer that turns a completed VIA USDM transfer into a real economic action.

The contract is intentionally **not** another bridge and it does **not** call VIA's USDM gateway contract. On the current ledger-8 Midnight environment there are no ordinary contract-to-contract calls. VIA delivers USDM to the user's Midnight wallet; this module then settles that unshielded USDM to a payee with a Compact circuit.

## Contract

`usdm-settlement.compact`

`settle(settlementId, amount, recipient, memoHash)` performs one atomic application transaction:

1. Claims the caller-provided USDM into the contract with `receiveUnshielded`.
2. Sends the same USDM amount to the payee with `sendUnshielded`.
3. Stores a public settlement receipt keyed by `settlementId`.
4. Increments the public settlement counter.

The contract does not retain principal after a successful settlement.

## Why this is a good fit for VIA USDM

VIA's deployed Midnight USDM is an **unshielded** token identified by its 32-byte token color. Amounts, recipients, and balances are therefore public on-chain. Settlement Studio does not market this as a private payment.

The only application metadata stored is a 32-byte `memoHash`. The original memo can stay off-chain while the hash provides a durable reference that can later be matched against the original content.

## Toolchain

Target the current ledger-8 environment with Compact toolchain `0.31.x` / language `0.23`.

```bash
compact self update
compact update 0.31
compact compile --version
```

The contract source pins:

```compact
pragma language_version 0.23;
```

Compile from the repository root:

```bash
npm run contract:compile
```

Generated output is written under:

```text
contracts/managed/usdm-settlement/
```

## Preview deployment parameter

For the VIA Cardano Preprod ↔ Midnight Preview route, initialize the contract with the deployed USDM token color:

```text
003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73
```

USDM uses 6 decimals, so:

```text
1 USDM   = 1,000,000 base units
25 USDM  = 25,000,000 base units
```

Do not substitute the VIA gateway contract address for the token color. Wallets and Compact unshielded token operations identify this asset by **color**.

## Settlement receipt

For each unique `settlementId`, the public ledger stores:

- amount in USDM base units
- recipient `UserAddress`
- `memoHash`

The `settlementId` is caller-supplied and cannot be reused within the deployment. The application should generate a collision-resistant 32-byte ID off-chain.

## Security / correctness properties

- Zero-value settlements are rejected.
- Duplicate settlement IDs are rejected.
- The contract accepts only the immutable token color configured at deployment.
- The same amount claimed from the transaction is sent to the payee.
- No `ownPublicKey()` authorization assumption is used.
- No gateway contract call is assumed.
- No shielded-payment claim is made for VIA USDM.

## Known implementation boundary

The source contract is now in the competition branch, but generated ZK assets and a deployed Preview address are **not** fabricated in this repository. They must come from a real `compact 0.31.x` compilation and a real Midnight deployment. Once those exist, the UI can replace its current post-bridge handoff with a proven `VIA delivery → Compact settlement → receipt` tail.
