# Live wallet acceptance test

Status: USER WALLET RUN NOT YET COMPLETED. Public reference transfers and isolated tests are not a transfer from the user's wallet.

## Required competition path

Cardano Preprod → VIA deployed USDM transport → Midnight Preview → evidence correlation → deterministic receipt.

Use an injected CIP-30 Cardano wallet and a Connector API v4 Midnight wallet (1AM) in the HTTPS app. Cardano needs Preprod ADA and test USDM; NIGHT is not the transferred asset. The user chooses a small test amount after balances are visible and approves inside the wallet. Never request recovery phrases or private keys.

VIA supplies its deployed contracts and proving assets. Settlement Studio owns discovery, preflight, correlation, and the receipt. Local Compact compilation, WSL recovery, and custom deployment do not gate this run.

## Build and server prerequisites

1. Run `npm test`, `npm run build`, and `npm run verify:via-runtime` on the dependency-install host.
2. Serve the production preview under HTTPS. SDK `NETWORK=testnet`; `/artifacts/midnight` contains the installed VIA Preview assets.
3. Host the fixed read routes in `vite.config.ts`: `/koios`, `/evidence/via/transactions/<source-hash>`, and `/evidence/midnight`. Vite dev and preview provide them; a static-only production host does not.
4. Connect Cardano on Preprod and Midnight through `connect('preview')`. Confirm addresses, configuration, spendable USDM, and Cardano ADA. If connection fails, collect the diagnostics described below before attempting a transfer.

## Required acceptance sequence

| Step | Action | Required evidence |
| --- | --- | --- |
| Authorization | User selects a small USDM amount and the connected Preview recipient; approves once | Captured amount, recipient, source identity and request timestamp; source hash returned by VIA SDK |
| Source | Check transfer evidence | Koios confirms the exact transaction and net USDM increase at VIA's deployed lock address |
| Transport | Check again while VIA processing is pending | VIA message ID, source hash, deployed client/contract, Preprod → Preview chain IDs, delivered destination hash; raw VILR payload matches token identities, sender, recipient and amount |
| Destination | Read the VIA-linked Preview transaction | Successful indexed transaction, block, recipient's exact net USDM credit, matching destination hash and VIA block |
| Receipt | Download the receipt once evidence completeness is 3 / 3 | Route integrity and amount continuity verified; timestamped provider responses, evidence hashes and canonical SHA-256 receipt hash |
| Integrity | Open the downloaded file in Verify a downloaded receipt | Original file hashes match; altering an amount or evidence fails. This local check does not authenticate chain data or the author |

If a service fails or evidence disagrees, download a partial receipt and retain the unverified state. A wallet balance increase alone never verifies a transfer. Check transfer evidence retries reads only. If SDK submission has an uncertain result, inspect wallet history; paste the actual source hash into Recover evidence to resume correlation against the captured intent without resending. Download before starting another intent; in-memory intent state is not durable across a page reload.

## Required Compact and return-transfer runs

After the forward checkpoint, open Compact controls in Advanced mode, compile genuine Compact 0.31.1 artifacts on compatible hardware, deploy, settle, and verify indexed state plus its transfer commitment. These are required sprint gates. Midnight → Cardano remains available but its independent three-boundary receipt reader is not implemented; do not claim reverse-route receipt verification.

DUST sponsorship is not inferred from a wallet name or balance display. Verify 1AM's Preview sponsorship experimentally for any wallet-proved action. Ura's September 8 announcement is Preprod-only and is outside this Preview route. Local Preview DUST is an alternative capacity source for required reverse/Compact actions; the present action preflight still requires an observed local balance until sponsorship support is validated.

## Recovery and interaction checks

- Reject a wallet prompt: no automatic resend; preserve the submitted intent and inspect wallet history before a new one.
- Try malformed addresses, mainnet addresses, too many decimals, zero, and an amount greater than balance: authorization stays blocked.
- Double-click authorize: only one source invocation.
- During a pending operation, route, amount, destination, and payee remain locked.
- Change wallet account/network externally: balance reads and preflight block use of stale identity.
- Remove a proving asset: execution remains locked or fails before proving; an HTML fallback must not count as an artifact.
- Delay arrival: observation pauses after three minutes and can be resumed without sending again.
- Fail the receipt lookup: finalized settlement remains visible; retry only the read.
- Inspect Simple/Advanced/Trace with keyboard and a narrow viewport; critical errors remain readable.

## Record actual results

Do not mark the required demo complete until a user-authorized Cardano → Midnight transfer has a 3 / 3 independently correlated receipt. Also require Compact deployment/USDM settlement and the VIA return transfer with operation-linked local-proof evidence and Cardano arrival. A 3 / 3 transport receipt remains incomplete for the full five-boundary operation. Keep source finality, VIA attribution, observed balance arrival, settlement, and receipt as separate claims. An unrelated deposit may explain a balance change, so balance observation alone never establishes VIA attribution.


## Connection diagnostics before transfers

If a wallet is detected but connection fails, expand **Connection details** in that wallet card and use **Copy connection details**. The report includes public injected provider keys, names, versions, method names/presence, alias groups, requested network, secure-context status, and the failed connection step with the original normalized error/code. It does not invoke enable/connect, sign, or read accounts/balances. Collect both cards' reports when investigating duplicate Cardano entries alongside a Midnight failure.

A background-service timeout does not prove the extension is absent, nor does an open extension panel prove its connector background service is responsive. The app uses the VIA SDK's connect(networkId) shape and requests Preview. Use the recorded step to distinguish rejection of that request from a later configuration or address read. Do not assume the failure is in the frontend or extension until the live evidence identifies it.

Let the visible 1AM synchronization finish before attempting transfers. The screenshot's PREV label, NIGHT balance, and partially synced DUST do not establish connected API identity, Cardano Preprod, spendable DUST capacity, or a USDM balance. Request connection through the app controls; no console signing calls are needed.


## Local proving and independent inspection

Use the existing VIA `bridgeUSDM` extension integration with 1AM on Preview. Capture the wallet's actual browser-WASM selection and a continuous recording of the return run with transaction identifiers; do not infer locality from a wallet name, DUST sponsorship, or accepted proof. VIA 1.2.0's `proving` status spans proof, balance and submission; exported phase times are explicitly combined timings. Proof-only telemetry and automatic reverse correlation remain outstanding. Compact settlement proving and VIA return proving are separate operations and must be labelled with their respective transaction IDs.

Open the exported receipt without connecting either wallet. Confirm hashes, recomputed transfer boundaries and explorer links. Confirm that local proof and application settlement remain unverified until their separate evidence is established. Check canonical JSON and hash copying. A valid file hash does not authenticate its issuer or provider data. No wallet seed or key is needed for compilation or receipt inspection.
