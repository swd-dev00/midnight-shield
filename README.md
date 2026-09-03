# VIA USDM Settlement Studio

**Cross-chain settlement without cross-chain complexity.**

VIA USDM Settlement Studio is an intent-driven browser interface for native USDM movement between Cardano and Midnight. It starts from VIA Labs' real `@via-labs-tech/usdm-bridge` browser path and adds the missing adoption layer: preflight checks, progressive abstraction, human-readable failure recovery, and an inspectable execution trace.

> **VIA makes cross-chain messaging possible. Settlement Studio makes operating it disappear.**

## What this branch implements

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

## Why the distinction matters

The current bridge hook confirms the source-side operation. It does not expose enough destination evidence for this UI to honestly claim that VIA delivery and destination settlement are already complete. The Intent Rail therefore marks the final VIA stage as a handoff after source acceptance rather than manufacturing a green checkmark.

That is deliberate: **abstraction should remove cognitive burden, not remove truth.**

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
- Midnight proving remains inside the connector-v4 wallet.
- No fake DUST sponsorship claim.
- No fake destination-settlement claim.
- The local intent label is explicitly not presented as on-chain metadata.

## Next competition layer

The transfer abstraction is the first production slice. The next layer is a Compact settlement module that consumes the arrived USDM for a real application action, followed by destination-state verification so the final rail node can be proven rather than inferred.

## Design system

See [`DESIGN.md`](./DESIGN.md). The visual thesis is **precision instrument, not crypto casino**. Gold is reserved for user intent and authorization; signal cyan is reserved for verified infrastructure state.

## Network

Competition demo target: **Cardano Preprod ↔ Midnight Preview**.
