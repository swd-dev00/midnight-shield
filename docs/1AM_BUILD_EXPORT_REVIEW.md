# 1AM Build export review

Input: `C:/Users/swarr/Downloads/Themetoggle-1am-build.zip`, inspected without importing its code, dependencies, or artifacts.

The archive includes four prover/verifier pairs and ZKIR files. Its compiler metadata identifies Compact 0.30.0, language 0.22.0, runtime 0.15.0. The active application requires the different settlement ABI and currently pins runtime 0.16.0 / Compact 0.31.1 artifacts. No proof was generated from this archive during review.

The source differs from `contracts/usdm-settlement.compact`:

- Constructor has no USDM color. There is no receiveUnshielded or sendUnshielded operation, token lock, or token transfer. `settle` only updates a ledger record and cannot satisfy the USDM settlement requirement.
- `verify_via_delivery` accepts a destination transaction and block from any caller and changes a Pending record to Delivered. It does not query VIA, verify an attestation, or prove delivery.
- `settle` accepts caller-supplied call/block/proof_time_ms fields. These do not demonstrate a real settlement transaction or local proof duration.
- `refund` changes a status label; it does not return assets. No caller ownership restriction is present on these transitions.
- Exported `settle(receipt_hash, settle_call, settle_block, proof_time_ms)` is incompatible with our `settle(settlementId, amount, recipient, memoHash)`. Keys are circuit-specific and cannot be swapped between them.

Disposition: reference only. None of the ZIP's managed artifacts or vendored packages were copied into the app. Use `1AM_BUILD_COMPILE_REQUEST.md` or `settlement-studio-compact-source.zip` to compile the actual USDM-moving contract. Line-ending normalization is documented in the source manifest; all substantive source changes require review and recompilation.
