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

## Evidence semantics

Settlement Studio deliberately refuses to collapse several different facts into one green `success` state:

1. **Source finality** — verified only when the bridge returns a real source transaction identifier.
2. **VIA delivery / release attribution** — requires independently attributable VIA message, relay, or scan evidence. A destination balance increase is not sufficient.
3. **Destination arrival** — for the connected destination wallet, the app snapshots USDM before authorization and polls after source acceptance. Arrival becomes verified only when the observed balance reaches `baseline + transfer amount`.
4. **Compact settlement** — remains non-complete until a real Midnight Preview deployment exists and an actual Compact execution is observed.
5. **Receipt** — requires settlement-linked on-chain/provenance evidence.

If the user supplies a different/manual recipient, Settlement Studio does not claim that it can observe that wallet. Destination evidence is marked unavailable.

The current browser bridge result exposes source-chain transaction output but does not expose an independently attributable VIA message identifier. Accordingly, the VIA rail remains **unverified** even when destination arrival is independently observed.

That is deliberate: **abstraction should remove cognitive burden, not remove truth.**

## Network integrity

The competition/testnet route is exactly:

```text
Cardano Preprod ↔ Midnight Preview
```

The Midnight connector reads `getConfiguration().networkId` after connection and refuses to arm the wallet when it is not `preview`.

**Midnight Pre-Prod is a different network.** NIGHT/DUST capacity visible on Pre-Prod cannot be counted as Preview execution capacity for the VIA testnet route. The user must switch the Midnight wallet to Preview and obtain/activate Preview execution capacity before wallet-local proving or Compact execution on this route.

## What this branch implements

### Transport abstraction

- Cardano CIP-30 wallet discovery and connection
- Midnight Connector API v4 discovery and connection
- Midnight Preview network validation after connection
- Live Cardano ADA + USDM wallet balances
- Live Midnight USDM + DUST capacity on the validated Preview wallet
- Cardano → Midnight `bridgeUSDM()` execution
- Midnight → Cardano `bridgeUSDM()` execution with wallet-local proving
- Real bridge phase streaming in the UI
- Intent-driven Simple / Advanced / Trace modes
- Blocking preflight for wallet, destination, USDM balance, network, and fee/execution capacity
- Human-readable error translation with raw errors retained in Trace mode
- Source-chain evidence links and VIA Scan access
- Explicit separation of **source finality**, **VIA attribution**, and **destination arrival**
- Destination balance evidence that cannot turn the VIA node green
- Manual-recipient evidence boundary

### VIA v1.2.0 browser proving runtime

The sprint build pins `@via-labs-tech/usdm-bridge` to **1.2.0** for reproducibility.

VIA's browser guide requires the package's bundled Midnight ZK assets to be served at:

```text
/artifacts/midnight
```

Settlement Studio now treats that as a P0 runtime invariant:

- Vite locates the installed bridge package's `artifacts/midnight` tree.
- The tree is copied into `public/artifacts/midnight` before dev/build startup.
- Startup fails if the package artifact directory is missing or empty.
- A generated `.via-assets-ready.json` manifest records package version, route, file count, and copied paths.
- The Midnight → Cardano hook checks that manifest in-browser immediately before calling `bridgeUSDM()`.
- Missing assets block the reverse leg **before** wallet-local proving and surface a targeted recovery message.
- Generated proving assets remain sourced from the pinned package and are ignored by Git rather than duplicated as repository binaries.

A successful TypeScript/Vite build alone is therefore **not** represented as proof that the reverse browser route works. Competition readiness still requires a real Midnight → Cardano wallet-local proof in-browser.

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

The source exists, but the project does **not** claim a Preview deployment or successful settlement until the Compact compiler, wallet-approved deployment transaction, contract address, and settlement transaction evidence actually exist.

## Local run

```bash
npm install
npm run dev
```

Wallet extensions require a secure context. The Vite configuration uses a local HTTPS dev server for extension testing. Vite also prepares VIA's bundled Midnight proving assets at `/artifacts/midnight` during startup.

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
Exposes wallet standard, Midnight network ID, proving behavior, raw bridge phase, source-finality evidence, VIA-attribution evidence, destination evidence, addresses, source transaction identifiers, explorer access, and raw error evidence.

## Security posture

- No mnemonic or seed phrase input.
- Cardano authorization remains inside the CIP-30 wallet.
- Midnight bridge proving remains inside the connector-v4 wallet.
- Midnight network identity is validated before the connector is treated as usable.
- Reverse-leg proving is blocked if `/artifacts/midnight` fails runtime verification.
- No fake DUST sponsorship claim.
- No fake VIA-attribution claim.
- No fake destination-settlement claim.
- No gateway contract call is invented for the Compact layer.
- The Compact module accepts one immutable USDM token color per deployment.
- VIA USDM is treated as unshielded; the project does not market it as a private payment.
- Raw settlement memo text remains off-chain; only a 32-byte memo hash is written.
- The local UI intent label is explicitly not presented as on-chain metadata.

## Verification

The repository verification ladder keeps separate claims separate:

```text
frontend:            TypeScript + Vite production build
VIA browser runtime: /artifacts/midnight manifest + real reverse-leg wallet proof
compact:             Compact 0.31 source compilation
browser integration: generated Compact adapter + frontend integration build
settlement:          finalized real Compact call on Midnight Preview
receipt:             independent public contract-state lookup
```

The jobs/evidence surfaces are separated so one result cannot be represented as proof of another.

Generated proving assets and a Preview deployment address are not fabricated or checked in before the real package/compiler/network produces them.

## Design system

See [`DESIGN.md`](./DESIGN.md). The visual thesis is **precision instrument, not crypto casino**. Gold is reserved for user intent and authorization; signal cyan is reserved for verified infrastructure state. An unverified evidence state uses a distinct dashed/gold treatment rather than borrowing the verified signal state.

## Network

Competition demo target: **Cardano Preprod ↔ Midnight Preview**.

Preview USDM token color:

```text
003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73
```
