# Settlement workflow contract

Source of truth: README.md evidence and network requirements, the Compact settlement contract, the VIA SDK browser API, and DESIGN.md. The application is an English-language, single-page transaction tool. Wallet prompts own transaction authorization.

## Canonical UI map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Form | App.tsx intent form; lib/amount.ts and lib/recipient.ts | VIA six-decimal amounts and Preview/Preprod route | Simple, Advanced, Trace expose one shared intent | validation regression tests and wallet runbook |
| Scrollbar | src/styles.css root tokens and global rules | DESIGN.md palette | document and horizontal trace overflow | static audit and narrow-screen check |
| Feedback | App.tsx Check, error panel, and Intent Rail | README.md evidence semantics | blocked, pending, verified, unavailable | unit tests and wallet runbook |

## Transaction behavior

- Capture amount, destination, payee, wallet identity, and memo before invoking the bridge. Lock inputs and route until the user explicitly starts another intent.
- Prevent synchronous duplicate activation. Never automatically retry a transfer or deployment after an uncertain wallet/provider outcome.
- Require checksum-valid network-bearing recipient addresses. Cardano base and enterprise testnet addresses are supported; CIP-30 network id zero cannot distinguish Preprod from other Cardano testnets, so the SDK/provider must remain pinned to Preprod.
- Refresh balances per wallet session. Failed reads block spending instead of retaining a stale spendable balance.
- An independently indexed receipt must match settlement ID, token color, amount, payee, and memo hash at the finalized transaction block. A receipt lookup failure does not undo a finalized transaction; retry only the read.
- Starting a new intent clears its evidence. A contract deployment may be reused on the same network. All wallet signatures remain with the user.
- No modal or select/listbox is required by this screen. Native input and button semantics are canonical. Named phase progress and inline recovery remain visible.

## Validation and recovery

Keep entered values when an action fails. Announce execution state in a polite live region, link field errors to their inputs, preserve keyboard focus, and keep disabled buttons visibly unavailable. A missing custom Compact proving artifact blocks Compact execution and full sprint completion, while leaving the forward VIA transfer checkpoint usable. Static build evidence and live chain evidence are separate acceptance gates.

## Responsive verification

The document must not overflow horizontally at 320, 390, or 1280 pixels in Simple, Advanced, or Trace. The header wraps at mobile widths; grid tracks and amount inputs may shrink below their intrinsic width. Run node scripts/test-browser-interactions.mjs against the local production preview to verify geometry, keyboard access, and invalid-input feedback. This isolated browser has no wallet extensions and cannot establish live transaction behavior.

## Wallet connection recovery

`src/components/WalletConnection.tsx` owns the shared Cardano/Midnight connection controls. Every disconnected card exposes a Connect action, even when no extension is detected. The empty state provides browser setup instructions, a copyable app address, and an explicit discovery retry. Discovery continues while the document is visible and refreshes on window focus. Discovery never signs, transfers, or connects automatically; only a user connection action requests wallet authorization. Connection failures remain visible beside the controls.

Cardano discovery accepts providers exposing an enable function regardless of their name. After explicit authorization, the app checks required read, signing, and submission methods before accepting a connection; incomplete providers and mainnet remain blocked. Discovery alone never invokes enable.

Provider aliases collapse only when they reference the identical injected object. Separate objects with the same display name retain separate controls labelled by provider key. Connection details expose public method names, provider keys/version, requested network, and the failed step with normalized error text. Opening or copying diagnostics never invokes wallet methods. Background timeouts acknowledge detection without assuming whether the wallet or app caused the failure.

## Required evidence receipt

`src/components/TransferReceipt.tsx` owns the five evidence panels and file controls. `src/lib/transferReceipt.ts` owns exact-amount correlation, canonical representation, finalization, and hashes. Only three matching provider-backed transfer boundaries may report 3 / 3, route integrity or amount continuity. Full operation evidence remains incomplete until local proof and application settlement are independently linked. Both the SDK report and balance observation are insufficient. Raw memo is excluded from the captured transfer manifest. Retry reads never authorize another transaction; stale or aborted reads cannot modify a new intent.

Download and current-receipt copy controls serialize only a frozen schema 1.2 snapshot with a valid `finalizedAt`. A read attempt must reach its settled state before finalization. Refreshing or changing the intent/source retires the prior snapshot immediately. Partial snapshots preserve unverified boundaries. The saved-file inspector reports integrity and recomputes transfer correlations without a wallet or network; it does not authenticate provider data. The in-memory intent must be downloaded before navigation or a new intent; persistence is not claimed.


September 10 scope correction: the receipt is a cross-chain correlation surface. Show five evidence boundaries, with 3 / 3 transport distinguished from incomplete 3 / 5 operation evidence. Local execution modality cannot be inferred from wallet identity. Compact settlement and locally proved VIA return are required sprint milestones. Delegate native transaction inspection to CardanoScan, VIA Scan, and 1AM Explorer. Saved receipts remain inspectable without wallets and recompute correlations from saved evidence; hash integrity is not authenticity.
