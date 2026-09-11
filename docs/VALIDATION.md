# Validation status - September 10, 2026

Current required scope: Cardano Preprod ↔ VIA USDM ↔ Midnight Preview, an actual locally proved return leg, our deployed Compact USDM settlement, and evidence correlation. The earlier forward-only scope below is superseded. Prior test counts describe prior builds; current changes are being validated. No current-user wallet connection, transfer, local WASM proof, or Compact deployment is claimed.

## Completed locally

- `npm run build`: PASS, exit 0. The wallet-diagnostics build passed TypeScript and transformed 4,498 modules; Vite packaging completed in 29m 4s under severe memory pressure (about 280 MB free during the build). The build process exited successfully.
- `npm run verify:via-runtime`: PASS for both public and production dist trees: five Preview assets, VIA SDK 1.2.0, direct `/artifacts/midnight` route.
- `npm test`: PASS, 12 tests, including provider alias identity, structured error normalization, metadata-only diagnostics, and the existing checks covering generated Compact receipt writes, duplicate IDs, zero amounts, receipt-field mismatches, exact USDM conversion, address network/checksum validation, one-base-unit arrival detection, and bounded read timeouts.
- `scripts/smoke-browser.ps1`: ran successfully at 1280px and 390px. Screenshot inspection exposed mobile overflow, which was fixed in source and rebuilt.
- `node scripts/test-browser-interactions.mjs`: PASS, 48 checks against the wallet-diagnostics production build. Covers initial render, disconnected authorization, keyboard access to detail modes, invalid amounts/recipient, and Simple/Advanced/Trace at 320/390/1280px with no horizontal overflow or uncaught browser exceptions. Also verifies that both Connect controls remain visible without extensions, browser setup help appears, a late-injected test provider is discovered without reload, and a rejected test connection stays visibly disconnected. These added provider checks use an explicit fixture, not a real wallet. Actual report and screenshots are under `.qa/`; the script uses an isolated Chrome profile without wallet extensions.
- UI static audit: PASS, zero findings. Script syntax and Git whitespace checks passed. Static checks do not establish wallet behavior.
- Compact browser preparation previously correctly refused incomplete generated output. No proving files were fabricated.

## Implemented

- Testnet remains pinned to Cardano Preprod / Midnight Preview, VIA SDK 1.2.0.
- VIA proving assets use their documented browser route and runtime manifest; libsodium resolution supports hoisted dependencies.
- Submitted intents lock amount, destination, payee, and memo; duplicate activation is blocked.
- Wallet network/account identity is rechecked, stale balance reads are rejected, and read-only polling has bounded recovery.
- The Compact adapter decodes Preview recipients, checks the token before spending, and uses the contract's browser proving path.
- Receipt verification independently compares indexed ledger fields at the finalized settlement block; receipt reads can be retried without resending a transaction.
- Evidence export omits the raw memo.
- Compilation rejects Windows' unrelated compact.exe and requires Midnight Compact 0.31.x.
- Responsive grids and amount inputs shrink correctly; the mobile header wraps; a body width floor no longer creates overflow beside the vertical scrollbar.

## Remaining acceptance gates — revised September 10

1. Complete the current user's live Cardano Preprod → VIA USDM → Midnight Preview authorization and transfer. Wallet connection diagnostics remain needed; no successful user-wallet connection or transfer is claimed.
2. Record a 3 / 3 correlated receipt with exact source lock amount, VIA identity/payload, and destination output evidence. Exercise rejected authorization and uncertain-submission recovery without resending automatically.
3. Review the existing SDK browser-external/WebSocket warnings on the actual connected wallet paths. Disconnected/fixture UI tests cannot establish those live paths.

4. Compile genuine Compact 0.31.1 settlement artifacts on compatible hardware, validate/import them, deploy on Preview, settle USDM, and independently read the resulting state. Link that settlement to transfer evidence through an explicit commitment; the current memo-only call does not yet establish that correlation.
5. Complete the VIA Midnight → Cardano return transfer with evidence that 1AM used local browser WASM. Capture wallet mode and operation-linked proof observations; SDK phase duration alone is insufficient. Confirm VIA delivery and Cardano arrival. Automatic reverse correlation remains unimplemented.

Compact deployment and local return proving are required sprint gates. Native N4500 ZKIR/WSL troubleshooting is not the chosen route. GitHub compiler billing remains a separate unresolved infrastructure blocker (last recorded run below); 1AM runtime proving does not compile our contract.

## Compiler CI

A dedicated `.github/workflows/compact-artifacts.yml` pins Compact 0.31.1, checks nonempty JavaScript/ZKIR/prover/verifier output, and records source and generated-file hashes. YAML parsing passed locally; the WSL shell syntax check could not complete because startup timed out.

The user authorized publication under their identity. Only the contract and this workflow were published relative to main on `swd-dev00/compact-artifacts`; main was not merged or changed. Author and committer were independently verified as the GitHub account `swd-dev00`, with no assistant co-author attribution.

- Commit: `65c128d635f9b9c54b5da12f78e462d2c44e8b66`
- Run: https://github.com/swd-dev00/midnight-shield/actions/runs/34414478464
- Status: FAILED BEFORE START. GitHub annotation: "The job was not started because your account is locked due to a billing issue." The compile job has zero executed steps and no compiler log or artifact. The account owner must resolve that GitHub billing lock before this job can run; no billing changes were made.

The user's supplied history reports Compact 0.31.1 key generation crashing with Illegal instruction / exit 132. Current Linux CPU flags confirm this Celeron N4500 has no AVX/AVX2. CPU incompatibility remains a hypothesis for that historical crash, not a newly reproduced or instruction-level diagnosis.

## Live chain status

NOT RUN. Live wallet deployment, transfer, and settlement are authorized project goals, but none has been executed. No current-user source transaction, VIA message, destination arrival, or receipt is claimed as live-verified. The user identified 1AM and supplied a Preview DUST address. Current provider identity, network, and spendable balances still require live wallet authorization.

## Workspace preservation

The active working copy remains `D:/AI/midnight-shield-repo`. Pre-existing staged changes and missing generated compiler/zkir files were preserved. No local commit or index reset was performed. The alternate `midnight-shield-p0` checkout and the two `D:/AI/via-*-backup.patch` files were not modified or applied.

`D:/UserData/Downloads/Midnight.io` was inspected as reference material. Its README and package manifest describe a separate deterministic UTXO concurrency model, not this VIA application or a Compact compiler installation. Its embedded run/submission instructions were not treated as a user request to publish or modify that project.

Windows dependencies were repaired from lockfile-integrity-checked cache archives and exact uncached build packages. Do not install Linux dependencies over the Windows node_modules tree.

## Wallet controls fix - September 10

The page previously hid every connection button when no extension was detected and stopped scanning after three seconds. Shared connection controls now remain available with browser setup guidance, a copyable app address, and a discovery retry. Visible-page polling and focus refresh discover wallets that appear later. No connection or transaction is requested merely by scanning. The production preview serves the rebuilt fix at https://localhost:4173/.

## Provider discovery and form fields - September 10

Removed the Cardano wallet-name exclusion for 1AM/Midnight-labelled providers. Discovery now requires an enable function; after explicit authorization the returned API must provide the required network, address, balance, UTXO, signing, and submission methods. This avoids hiding a compatible provider by name while rejecting incomplete APIs. Test fixtures verify name-independent discovery and connection, incomplete-API guidance, metadata filtering, and mainnet rejection. These fixtures do not establish real 1AM Cardano support.

All intent and wallet-help inputs now have unique id and name attributes to resolve the reported form-autofill warning. The production build, nine regression tests, 41 isolated-browser checks, VIA asset verification, and static UI audit passed. The narrow-screen screenshot was inspected. Real wallet authorization and the separate console error visible only as a count in the user screenshot remain unverified.


## 1AM primary-source review - September 10

The user's https://1am.xyz/developers guide confirms window.midnight['1am'].connect('preview'), subsequent configuration/address reads, and wallet-managed proving/balancing. It documents ProofStation sponsorship: the user's own DUST balance is not universally required. The current DUST-only preflight must be reconciled with the actual connected 1AM configuration and sponsored balancing path before claiming live execution readiness. No direct proof/balance API request, API-key provisioning, or transaction was performed.

A read-only GET of the documented public https://api-preview.1am.xyz/health endpoint returned overall healthy status (version 0.11.0), balance service ok, but upstream unavailable and midnight_rpc_ws unavailable with a TCP connection timeout to rpc.preview.midnight.network:443. This is a point-in-time backend observation, not proof that it caused the extension's background-message timeout. The authenticated wallet-status endpoint was not called.

https://build.1am.xyz/ advertises Compact compilation and deployment and presents sign-in. It is a potential alternative to the billing-blocked GitHub compiler job; authenticated project access, Compact version compatibility, and usable compiled artifacts have not been established. No project was created or published there.


## Wallet connection diagnostics - September 10

Identical provider-object aliases now share a connection control while separate objects with the same display name remain selectable using key-qualified labels. Normalized wallet errors preserve message/info/code instead of rendering [object Object]. Background timeouts acknowledge that a provider was detected. Each wallet card can display and copy public metadata and the failed step: initial connection, configuration/network, or address read. Neither opening nor copying diagnostics invokes wallet methods.

Validation: production build exit 0; 12 regression tests; 48 isolated-browser checks; both VIA runtime asset trees; strict UI audit (zero findings); patch whitespace checks. Browser fixtures exercised plain-object Cardano rejection, same-object aliases, distinct same-name providers, initial Midnight timeout, and a later configuration failure. The expanded diagnostics screenshot was inspected at 390px. No live wallet call or transaction was performed. The actual 1AM provider keys and failure report must still be collected from the user's browser; automation startup remains blocked by the Windows sandbox setup error.

## September 10 — deployed VIA evidence path

The app now separates the required transfer receipt from optional Compact. SDK acceptance and wallet balance movement do not establish destination/VIA verification. The read-only receipt collector uses Koios, VIA Scan's public transaction lookup, and the Preview indexer; fixed local proxy routes are present in dev and preview. The receipt records exact micro-USDM strings, the network pair, transaction/message IDs, observed and chain timestamps, raw evidence hashes and a canonical SHA-256 root. Raw intent memo is excluded. Recovery accepts an actual Cardano source hash only for read-only correlation against the captured intent.

Live PUBLIC REFERENCE check, not a user-wallet test: the existing September 9 transfer `6649feaf9aae1f77e47270362851e4a38c47708991bd62300a032ddcf91ecfea` correlated 0.01 USDM through VIA message `227326600000000000000000000420` to Preview transaction `be2aec31f4dd33f0d99ba873c7644e6062445f0183afed44ce6aa799f0de58ea`. Independent source and destination reads matched blocks 5156134 and 788813; all three provider-backed boundaries and amount continuity passed. Saved locally under `.qa/public-reference-receipt.json`. This reference was read only; no signature or transaction was requested.

This check exposed real API differences handled by the implementation: VIA's Cardano client is zero-padded to 32 bytes, Midnight owners are Preview bech32m addresses, and Midnight block timestamps are epoch milliseconds. Koios Preprod currently omits `valid_contract`; source evidence relies on positive inclusion plus indexed net lock outputs and rejects an explicit invalid flag when supplied.

Final validation: production build exit 0 (Vite 4m 40s; main bundle index-fxdGazAM.js); 25 regression tests passed; 64 isolated browser checks passed with zero uncaught exceptions. Both public/dist VIA asset trees passed. Strict UI audit: zero findings. CRLF-aware Git whitespace check passed. Browser checks cover exact displayed USDM, optional Compact off by default, complete/partial receipt export, local hash verification, tampered files, unavailable VIA, mismatched destination amounts, stale responses after clearing an intent, and responsive geometry. HTTPS root and both live evidence proxies returned 200 using public reference data. Preview is running on port 4173. No new commit or publication was made.

Sponsorship scope: Ura's announced Preprod pilot is not wired into Preview. 1AM Preview sponsorship remains an experimental wallet acceptance check. No sponsorship success is claimed.


## Current evidence-layer implementation — September 10

Five boundaries are visible: source, VIA, destination, local proof, application settlement. A 3 / 3 transfer receipt explicitly remains an incomplete 3 / 5 operation. Schema 1.1 stores unknown proof runtime and unverified settlement correlation, even if an SDK execution report exists. Return SDK stages record wall timestamps and monotonic elapsed time; the SDK's proving stage includes balance and submission, so it cannot establish pure proof time or WASM locality.

Saved receipts can be opened without wallet or network access; hashes are checked and transfer correlations recomputed from the saved responses. Provider authenticity is not established by hashes. Copy canonical JSON/hash and direct CardanoScan, VIA Scan message, and 1AM Preview transaction links are implemented. Explorer routes were checked against their public clients. This is a correlation surface, not a replacement Midnight explorer.


## User-supplied forward operation — independently read September 10

Saved receipt: `evidence/via-message-421.receipt.json`. Cardano source `4b36845ac4b4d23207c44fa69700a9742eee9c52e7ba1ef82f23f15a7b3a50e1` at block 5161327 was independently checked via Koios (124 confirmations at observation). Its net VIA lock increase is exactly 20 USDM. VIA message `227326600000000000000000000421` binds sender, recipient, asset, amount, route, and destination `e61b3dac3a85022d4387b6bf47f3071f5d636c9a6f702b39ba86b1108c01c74a`. Preview independently confirms 20 USDM credited, full SUCCESS, block 808107/hash `4410195006360c28f9929ddf32335b9ae86c9a5ce850b7495d13a7944bc5386c`, and the deployed VIA gateway's `process` entry point. Timestamp is `2026-09-10T18:49:54.000Z` (14:49:54 America/New_York), not timezone-free 14:49:54 UTC. Raw indexer fee fields are both string `1`; no unit conversion is inferred.

Transfer correlation is 3 / 3; full operation evidence remains 3 / 5. Local return proof and our Compact settlement are unverified. The receipt explicitly records an intent reconstructed from public evidence: this is not a captured Settlement Studio wallet authorization. VIA node confirmation metadata is preserved, but validator signatures are not independently verified (the lookup returned an empty signatures array). Block author is not used as a participant identity.

30 regression tests passed after adding block, gateway identity, and timestamp checks. The first new production build was stopped to relieve severe memory pressure; it was not a successful build. Browser access to the user-supplied 1AM Build project failed during automation initialization even after memory recovered, so its compiler output remains uninspected. See `1AM_BUILD_HANDOFF.md` for the exact source and required exported artifacts.


The user subsequently supplied `Themetoggle-1am-build.zip`. Inspection found Compact 0.30.0/runtime 0.15.0 artifacts for a different metadata registry, not the active USDM-moving settlement contract. No exported code/artifacts were imported. See `1AM_BUILD_EXPORT_REVIEW.md` and the prepared `settlement-studio-compact-source.zip` for a concrete corrected compilation handoff.
