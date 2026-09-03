# VIA USDM Settlement Studio

**Cross-chain settlement without cross-chain complexity.**

VIA USDM Settlement Studio is an intent-driven browser interface for native USDM movement between Cardano and Midnight. It starts from VIA Labs' real `@via-labs-tech/usdm-bridge` browser path and adds the missing adoption layer: preflight checks, progressive abstraction, human-readable failure recovery, an inspectable execution trace, and a Compact application layer that can settle arrived USDM to a payee.

> **VIA makes cross-chain messaging possible. Settlement Studio makes operating it disappear.**

## Architecture

```text
USER INTENT
     │
     ▼
Settlement Studio
     │
     ├── wallet discovery + preflight
     ├── Cardano / Midnight route selection
     └── bridgeUSDM()
              │
              ▼
      VIA cross-chain messaging
              │
              ▼
      USDM arrives on Midnight
              │
              ▼
Compact settle()
     │
     ├── receiveUnshielded(USDM color, amount)
     ├── sendUnshielded(USDM color, amount, payee)
     └── write settlement receipt
```

The VIA gateway and the application contract remain separate responsibilities. The Compact module does **not** assume EVM-style contract-to-contract calls; it consumes the USDM already available to the user's Midnight transaction.

## What this branch implements

### Transport abstraction

- Cardano CIP-30 wallet discovery and connection
- Midnight Connector API v4 discovery and connection
- Live Cardano ADA + USDM wallet balances
- Live Midnight USDM + DUST capacity
- Cardano → Midnight `bridgeUSDM()` execution
- Midnight → Cardano `bridgeUSDM()` execution with wallet-local proving
- Real bridge phase streaming in the UI
- Intent-driven Simple / Advanced / Trace modes
- Blocking preflight for wallet, destination, USDM balance, and fee/execution capacity
- Human-readable error translation with raw errors retained in Trace mode
- Source-chain evidence links and VIA Scan access
- Explicit distinction between **source acceptance** and **destination delivery**

### Compact application layer

- `contracts/usdm-settlement.compact`
- Compact language `0.23`, targeting the ledger-8-compatible `0.31.x` toolchain family
- Immutable USDM token-color configuration at deployment
- Atomic `settle(settlementId, amount, recipient, memoHash)` circuit
- `receiveUnshielded` + `sendUnshielded` application settlement
- Duplicate settlement-ID protection
- Public receipt maps for amount, recipient, and memo hash
- Public settlement counter
- No raw memo written to the ledger

See [`contracts/README.md`](./contracts/README.md) for the contract model and deployment parameter.

## Why source acceptance is not called destination settlement

The current bridge hook confirms the source-side operation. It does not expose enough destination evidence for this UI to honestly claim that VIA delivery and destination settlement are already complete. The Intent Rail therefore marks the final VIA stage as a handoff after source acceptance rather than manufacturing a green checkmark.

That is deliberate: **abstraction should remove cognitive burden, not remove truth.**

Once a real Compact deployment and destination-state observer are connected, the rail can extend from VIA delivery into a separately proven Compact settlement receipt.

## Local run

```bash
npm install
npm run dev
```

Wallet extensions require a secure context. The Vite configuration uses a local HTTPS dev server for extension testing.

Optional Cardano provider:

```bash
cp .env.example .env
# add VITE_BLOCKFROST_PREPROD if desired
```

Without a Blockfrost key, the dev server can proxy applicable Cardano reads through Koios, following VIA's demo configuration pattern.

## Compile the Compact module

Install Compact devtools and select the ledger-8-compatible toolchain:

```bash
compact self update
compact update 0.31
compact compile --version
npm run contract:compile
```

The contract itself pins `pragma language_version 0.23;`.

## Product modes

### Simple
The user sees the economic action: source, amount, destination, authorize.

### Advanced
Adds local intent metadata and a manual destination override without exposing bridge-package internals.

### Trace
Exposes wallet standard, proving behavior, raw bridge phase, addresses, source transaction identifiers, explorer access, and raw error evidence.

## Security posture

- No mnemonic or seed phrase input.
- Cardano authorization remains inside the CIP-30 wallet.
- Midnight bridge proving remains inside the connector-v4 wallet.
- No fake DUST sponsorship claim.
- No fake destination-settlement claim.
- No gateway contract call is invented for the Compact layer.
- The Compact module accepts one immutable USDM token color per deployment.
- VIA USDM is treated as unshielded; the project does not market it as a private payment.
- Raw settlement memo text remains off-chain; only a 32-byte memo hash is written.
- The local UI intent label is explicitly not presented as on-chain metadata.

## Verification

The repository workflow checks both surfaces:

```text
frontend: TypeScript + Vite production build
contract: Compact 0.31 toolchain + usdm-settlement.compact compilation
```

Generated proving assets and a Preview deployment address are not fabricated or checked in before a real contract compilation/deployment produces them.

## Design system

See [`DESIGN.md`](./DESIGN.md). The visual thesis is **precision instrument, not crypto casino**. Gold is reserved for user intent and authorization; signal cyan is reserved for verified infrastructure state.

## Network

Competition demo target: **Cardano Preprod ↔ Midnight Preview**.

Preview USDM token color:

```text
003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73
```
