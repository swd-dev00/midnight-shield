# Compact artifact handoff

Project supplied by the owner: https://build.1am.xyz/chats/-ohZdSWfGG78ZV6R

Browser automation could not initialize, so this project has not been inspected. Do not assume its source, compiler, or artifacts match this repository.

Compile `contracts/usdm-settlement.compact` with Midnight Compact 0.31.1 on compatible build hardware. Constructor: one 32-byte USDM token color. Circuit: `settle(settlementId, amount, recipient, memoHash)`. Preserve the existing interface and replay protection. VIA gateway artifacts already come from VIA SDK 1.2.0 and must not be rebuilt here.

Expected source SHA-256: `0921b5337366d7737fee7840b9860ae7f9b5a6eb85bc2d72caadcee58d22b10f`.

The source's exact bytes, including line endings, must match this hash. Export the complete generated settlement directory as a ZIP with:

- `contract/index.js`, `contract/index.d.ts`, and generated support files
- `compiler/contract-info.json`
- `zkir/settle.zkir`
- `keys/settle.prover` and `keys/settle.verifier`
- compiler version output, the source used, and a successful full compile log

Do not use `--skip-zk`, placeholder proving keys, or a successful JavaScript-only compile as evidence of full compilation. Export artifacts for local verification before any deployment. No wallet seed, private key, API secret, or mainnet operation is required to compile.

After matching source/compiler and inspecting the archive, import into `contracts/managed/usdm-settlement`, run `npm run contract:prepare-browser`, then rebuild. This is a compilation handoff only. Wallet connectivity, Preview deployment/settlement, and operation-linked evidence of 1AM browser WASM return proving still require live validation.
