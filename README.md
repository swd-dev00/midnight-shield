# VIA USDM Settlement Studio

**VIA moves the asset. Settlement Studio proves what happened across the boundaries.**

The forward transfer checkpoint uses VIA's deployed USDM infrastructure on Cardano Preprod → Midnight Preview, then correlates source, transport, and destination evidence into a deterministic receipt. VIA is a trusted external transport dependency. Settlement Studio does not create VIA's contracts, transport proofs, or proving keys.

## Architecture

```text
Cardano CIP-30 authorization
  → @via-labs-tech/usdm-bridge (NETWORK=testnet)
  → VIA deployed USDM contracts and installed Preview artifacts
  → Midnight Preview arrival
  → independent Cardano / VIA / Midnight reads
  → correlated, hashed receipt and verification surface

Required sprint milestones: custom Compact USDM settlement and on-chain receipt
  → VIA return transfer with evidenced local proving
  → Cardano Preprod arrival
```

The full sprint requires a deployed Compact contract settling USDM and a return transfer generating the ZK proof locally, as listed in the [official sprint post](https://forum.midnight.network/t/via-labs-sprint-is-live/1326). A forward transfer alone is a checkpoint, not completion.

Compile our Compact 0.31.1 artifacts on compatible hardware, then import and validate them here. The N4500 native ZKIR failure is not being retried. VIA supplies its own gateway artifacts. 1AM browser WASM is a candidate for runtime proving on this machine; the installed wallet's selected mode and a successful actual operation still need evidence. Do not install the landing-page `1am` snippet: the public npm package lookup returned 404. Keep VIA's injected-wallet integration.

## Evidence semantics

1. **SDK source acceptance** is a report, not independent confirmation.
2. **Source verification** queries Koios for inclusion and the exact integer USDM increase at VIA's deployed Cardano lock address.
3. **VIA verification** reads the source-hash lookup used by VIA Scan. It checks the chain pair, deployed contracts, delivery identifiers, and raw VILR payload's amount, sender, recipient and asset identities. VIA's report is trusted; validator signatures are not independently checked.
4. **Destination verification** queries the Preview indexer for that destination hash and checks successful inclusion, matching block, and the recipient's exact net USDM credit.
5. **Local proof and application settlement** remain unverified until operation-linked runtime evidence and indexed Compact state with a transfer commitment are available. SDK phase times are not proof-only measurements: VIA 1.2.0 includes proving, balancing and submission in its proving phase. An execution report alone cannot verify causality.
6. **Receipt** binds the captured intent, all three boundaries, correlation results, timestamps, provider responses and per-observation hashes. A canonical UTF-8 JSON record with sorted keys is SHA-256 hashed excluding its own receiptHash. Schema 1.1 adds five-boundary operation status and preserves 1.0 imports. Local file inspection recalculates transfer correlations from saved responses instead of trusting saved success labels; it checks integrity, not provider authenticity or author identity. It requires no wallet or network. Canonical JSON and receipt hashes are copyable. Transaction links open CardanoScan, VIA Scan and 1AM Explorer; the app does not reproduce their native transaction panels.

Balance movement is supplementary, unattributed evidence. Missing or mismatched records remain unverified; partial receipts are downloadable and never labelled 3 / 3. Receipt reads can be retried without resending a transaction. The initial correlation reader supports Cardano → Midnight only. A manually entered Preview recipient can be independently checked even without a connected destination wallet, because transaction outputs bind that recipient.

The local server must provide `/koios`, `/evidence/via/transactions/<64-hex-source-hash>`, and `/evidence/midnight`. Both Vite dev and preview include these fixed upstream routes. Production hosting must supply equivalent routes; static hosting alone is insufficient. No explorer delivery-trigger or sponsorship endpoint is invoked.

See [the live-wallet runbook](docs/WALLET_TEST.md) and [validation record](docs/VALIDATION.md) for current evidence and remaining gates. The current user's transfer has not yet been completed.

## Network integrity

The competition/testnet route is exactly:

```text
Cardano Preprod ↔ Midnight Preview
```

The Midnight connector reads `getConfiguration().networkId` after connection and refuses to arm the wallet when it is not `preview`.

**Midnight Pre-Prod is a different network.** NIGHT/DUST capacity visible on Pre-Prod cannot be counted as Preview execution capacity for the VIA testnet route. The user must switch the Midnight wallet to Preview and obtain/activate Preview execution capacity before wallet-managed proving or Compact execution on this route.

## Production rail, testnet sprint

VIA's [USDM developer guide](https://developer.vialabs.tech/docs/examples/guides/usdm-cardano-midnight/) (checked September 9, 2026) documents live, permissionless USDM transfers on both Cardano Mainnet ↔ Midnight mainnet and Cardano Preprod ↔ Midnight Preview. Its browser path uses injected Cardano CIP-30 and Midnight Connector API v4 wallets, without browser mnemonics or a separate proof server.

Settlement Studio targets the Preprod/Preview pair for the competition sprint. It builds against VIA's production USDM rail through its testnet deployment. Mainnet availability does not establish that this application has been validated on mainnet or that a particular testnet transfer or settlement succeeded.

Submission framing: **Settlement Studio is designed to validate the application flow on Preprod/Preview, with wallet, routing, evidence, and settlement boundaries that can carry forward to VIA's documented mainnet pair.** Say “validated” only alongside recorded transaction evidence for the stages actually completed.

### Network boundaries and promotion work

The intended mainnet path preserves the intent → wallet authorization → VIA transfer → destination observation → application settlement flow. The current build is deliberately pinned to testnet; promotion requires coordinated configuration and validation, not merely changing a label or setting an environment variable.

| Boundary | Current implementation | Mainnet promotion requirement |
| --- | --- | --- |
| Wallet authorization | Injected-wallet bridge hooks; Midnight network checked in `useMidnightWallet` and settlement providers | Validate both wallets and recipients against the selected pair, including network changes after connection |
| Routing and reads | `vite.config.ts` pins SDK `NETWORK` to `testnet`, uses a Preprod Koios proxy and optional Preprod Blockfrost key | Select SDK network, provider endpoints, credentials, and explorer links together; confirm installed SDK support |
| Asset identity | `src/config.ts` contains Preprod asset unit and Preview token color | Supply verified identities for the target pair; never reuse testnet identifiers |
| Evidence | Source transaction, VIA attribution, destination balance observation, settlement, and receipt are separate facts | Retain those semantics; scope observations and transaction links to the selected network and discard stale evidence when it changes |
| Application settlement | Separate Compact contract consumes arrived USDM; token color is immutable per deployment | Deploy and verify a separate contract with the target token color, compatible proving assets, and its own address |

Sprint execution remains on Preprod/Preview unless the quest explicitly requires production funds. Mainnet operation is a future validated deployment of these boundaries. No mainnet execution or successful end-to-end validation is asserted by this architectural plan.

## What this branch implements

### Transport abstraction

- Cardano CIP-30 wallet discovery and connection
- Midnight Connector API v4 discovery and connection
- Midnight Preview network validation after connection
- Live Cardano ADA + USDM wallet balances
- Live Midnight USDM + DUST capacity on the validated Preview wallet
- Cardano → Midnight `bridgeUSDM()` execution
- Midnight → Cardano `bridgeUSDM()` execution with wallet-managed proving
- Real bridge phase streaming in the UI
- Intent-driven Simple / Advanced / Trace modes
- Blocking preflight for wallet, destination, USDM balance, network, and fee/execution capacity
- Human-readable error translation with raw errors retained in Trace mode
- Source-chain evidence links and VIA Scan access
- Explicit separation of **source finality**, **VIA attribution**, and **destination arrival**
- Destination balance observation that cannot turn any transaction-verification boundary green
- Manual-recipient evidence boundary

### Optional Compact application layer

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

## Acceptance tests

Run `npm test` for generated-circuit tests, receipt mismatch checks, and recipient/amount regressions. Run `npm run typecheck`, `npm run build`, and `npm run verify:via-runtime` for the browser build and copied VIA assets. Use Node 22.18+ for the native TypeScript test loader. Install dependencies on the host where you run the app; Windows and Linux native build packages differ.

The [live wallet runbook](docs/WALLET_TEST.md) defines the network acceptance test. This USDM route requires Preview/Preprod funds, wallet authorization, and recorded transaction evidence. Download settlement evidence from the app after execution. Input amount, destination, payee, and memo remain locked to each submitted intent.

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

## Optional: compile the Compact module

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
- The connector-v4 wallet manages Midnight proving and any configured proving service.
- Midnight network identity is validated before the connector is treated as usable.
- No fake DUST sponsorship claim.
- No fake VIA-attribution claim.
- No fake destination-settlement claim.
- No gateway contract call is invented for the Compact layer.
- The Compact module accepts one immutable USDM token color per deployment.
- VIA USDM is treated as unshielded; the project does not market it as a private payment.
- Raw settlement memo text remains off-chain; only a 32-byte memo hash is written.
- The local UI intent label is explicitly not presented as on-chain metadata.

## Verification

The repository workflow checks the two build surfaces independently:

```text
frontend: TypeScript + Vite production build
compact:  Compact 0.31 toolchain + usdm-settlement.compact compilation
```

The jobs are separated so a frontend result is not misrepresented as Compact verification, or vice versa.

Generated contract JavaScript is present and exercised by local regression tests. Complete proving assets are checked separately; JavaScript alone does not unlock Compact execution. A Preview deployment address must come from a finalized deployment.

## Design system

See [`DESIGN.md`](./DESIGN.md). The visual thesis is **precision instrument, not crypto casino**. Gold is reserved for user intent and authorization; signal cyan is reserved for verified infrastructure state. An unverified evidence state uses a distinct dashed/gold treatment rather than borrowing the verified signal state.

## Network

Competition demo target: **Cardano Preprod ↔ Midnight Preview**.

Preview USDM token color:

```text
003bacd9a361ba0d425e408776020e40271375e8b8de42d73eec046a44947d73
```
