# Request for the existing 1AM Build project

Compile the attached Settlement Studio contract with Midnight Compact 0.31.1 (language 0.23 / runtime 0.16). The previous Themetoggle export used compiler 0.30.0 and contains a different, record-only contract; do not reuse its keys or claim its state labels prove VIA delivery or USDM settlement.

Preserve this contract's constructor and circuit exactly: constructor takes the USDM color; settle takes settlementId, amount, recipient, memoHash. It must atomically receive and send the same unshielded USDM amount and record the receipt, reject duplicate IDs, and reject zero amounts. Do not replace it with create_settlement/verify_via_delivery/refund metadata circuits.

Export genuine full-compile JavaScript, type declarations, compiler metadata, settle.zkir, settle.prover, and settle.verifier, plus the compiled source and compile log. Do not deploy, change networks, request seeds, synthesize artifacts, or claim completion from skip-ZK output. If 0.31.1 is unavailable, report the available compiler versions before changing dependencies or the contract.

Raw source SHA-256: `0921b5337366d7737fee7840b9860ae7f9b5a6eb85bc2d72caadcee58d22b10f`.
LF-normalized source SHA-256: `bccb17d27a8cfd59f40398a270d0b51223b7a118c7311b9c60f3fe74fac11c9f` (only CRLF → LF normalization is allowed for this comparison).

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

/**
 * VIA USDM Settlement Studio — atomic Midnight settlement module.
 *
 * The contract does not call the VIA USDM gateway. Midnight ledger 8 has no
 * ordinary contract-to-contract calls. Instead, the caller first receives
 * bridged USDM in their Midnight wallet, then this circuit consumes that
 * unshielded USDM from the transaction, routes it to the payee, and records
 * a public settlement receipt.
 *
 * USDM on the current VIA route is unshielded, so amount and recipient are
 * public by construction. Only a memo hash is stored; the memo itself stays
 * off-chain.
 */

/** Immutable token color accepted by this deployment. */
export sealed ledger usdmColor: Bytes<32>;

/** Public, queryable receipt fields keyed by a caller-supplied unique ID. */
export ledger settlementAmounts: Map<Bytes<32>, Uint<128>>;
export ledger settlementRecipients: Map<Bytes<32>, UserAddress>;
export ledger settlementMemoHashes: Map<Bytes<32>, Bytes<32>>;
export ledger settlementCount: Counter;

constructor(_usdmColor: Bytes<32>) {
    usdmColor = disclose(_usdmColor);
}

/**
 * Atomically settle USDM to a payee and persist a receipt.
 *
 * `settlementId` must be unique for this contract deployment.
 * `amount` is expressed in USDM base units (USDM uses 6 decimals).
 * `memoHash` is a 32-byte commitment generated off-chain; no raw memo is
 * written to the public ledger.
 */
export circuit settle(
    settlementId: Bytes<32>,
    amount: Uint<128>,
    recipient: UserAddress,
    memoHash: Bytes<32>
): [] {
    const publicId = disclose(settlementId);
    const publicAmount = disclose(amount);
    const publicRecipient = disclose(recipient);
    const publicMemoHash = disclose(memoHash);

    assert(publicAmount > 0, "Settlement amount must be greater than zero");
    assert(!settlementAmounts.member(publicId), "Settlement ID already used");

    // Claim the caller-provided USDM into this contract transaction.
    receiveUnshielded(usdmColor, publicAmount);

    // Route the same USDM amount to the payee in the same transaction.
    sendUnshielded(
        usdmColor,
        publicAmount,
        right<ContractAddress, UserAddress>(publicRecipient)
    );

    // Persist an inspectable settlement receipt.
    settlementAmounts.insert(publicId, publicAmount);
    settlementRecipients.insert(publicId, publicRecipient);
    settlementMemoHashes.insert(publicId, publicMemoHash);
    settlementCount.increment(1);
}
```
