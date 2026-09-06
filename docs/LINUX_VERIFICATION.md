# Linux-first verification

GitHub Actions is not the authoritative competition gate for this project. The sprint build is verified locally on Linux so runner availability or paid GitHub minutes cannot block evidence collection.

## Canonical command

```bash
npm run verify:linux
```

The command is intentionally strict. It verifies:

1. Linux host.
2. Node.js 22+.
3. `@via-labs-tech/usdm-bridge` exactly `1.2.0`.
4. TypeScript + Vite production build.
5. VIA Midnight proving assets generated from the installed package at `/artifacts/midnight`.
6. The generated manifest matches the actual copied artifact count in both `public` and `dist`.
7. Compact CLI availability.
8. `contracts/usdm-settlement.compact` compilation with the selected 0.31 toolchain.
9. Generated Compact browser adapter.
10. Final browser integration production build.

If Compact is not installed, the verifier stops and prints the exact installer/toolchain commands instead of silently skipping contract verification.

## What the Linux verifier does not claim

A static/build pass does **not** prove the live cross-chain path. The following remain separate evidence gates:

```text
Midnight Preview wallet connected
        ↓
Preview DUST capacity available
        ↓
/artifacts/midnight runtime preflight passes
        ↓
Midnight → Cardano bridge invoked
        ↓
Connector-v4 wallet-local proving observed
        ↓
Midnight source burn finalized
        ↓
VIA release evidence
        ↓
Cardano destination arrival verified
```

The judge demo must capture a real reverse-leg proof in-browser. A green `npm run verify:linux` result is necessary infrastructure evidence, not a substitute for that transaction.

## First-time Linux setup

From the repository root:

```bash
npm install
```

If Compact devtools are not installed:

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.2/compact-installer.sh | sh
source "$HOME/.local/bin/env"
compact update 0.31
compact compile --version
```

Then run:

```bash
npm run verify:linux
```

## Runtime proof check

When the app is running locally over HTTPS, this route must resolve before the reverse leg is authorized:

```text
/artifacts/midnight/.via-assets-ready.json
```

The manifest must report:

```text
package = @via-labs-tech/usdm-bridge
version = 1.2.0
route   = /artifacts/midnight
fileCount > 0
```

The Midnight → Cardano hook checks the same manifest again immediately before `bridgeUSDM()` and blocks proving if it is unavailable or invalid.

## Evidence discipline

Keep these facts distinct in screenshots, logs, demo narration, and the Intent Rail:

- source authorization
- source transaction/finality
- VIA-attributable delivery/release
- destination balance arrival
- Compact settlement execution
- receipt-state verification

No later event should be used to manufacture proof of an earlier stage.