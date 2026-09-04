#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

printf '\n=== VIA Settlement Studio / Linux verification ===\n'

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: this verification path is intentionally Linux-first. Current OS: $(uname -s)" >&2
  exit 2
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node 22+ and rerun." >&2
  exit 2
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 22 )); then
  echo "ERROR: Node 22+ required; found $(node -v)." >&2
  exit 2
fi

echo "✓ Linux: $(uname -srmo)"
echo "✓ Node: $(node -v)"
echo "✓ npm: $(npm -v)"

echo
echo "[1/5] Installing pinned JavaScript dependencies"
npm install

BRIDGE_VERSION="$(node -p "require('./node_modules/@via-labs-tech/usdm-bridge/package.json').version")"
if [[ "$BRIDGE_VERSION" != "1.2.0" ]]; then
  echo "ERROR: expected @via-labs-tech/usdm-bridge 1.2.0, found $BRIDGE_VERSION" >&2
  exit 3
fi
echo "✓ @via-labs-tech/usdm-bridge@$BRIDGE_VERSION"

echo
echo "[2/5] Frontend production build + VIA ZK artifact preparation"
npm run build
node scripts/verify-via-runtime.mjs

echo
echo "[3/5] Compact compiler check"
if ! command -v compact >/dev/null 2>&1; then
  cat >&2 <<'EOF'
ERROR: Compact CLI not found.
Install Midnight Compact devtools, select the 0.31 toolchain, then rerun:

  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.2/compact-installer.sh | sh
  source "$HOME/.local/bin/env"
  compact update 0.31
  npm run verify:linux
EOF
  exit 4
fi

COMPACT_VERSION="$(compact compile --version)"
echo "✓ Compact compiler: $COMPACT_VERSION"

echo
echo "[4/5] Compile settlement contract + generate browser adapter"
rm -rf contracts/managed/usdm-settlement
mkdir -p contracts/managed
npm run contract:compile

test -f contracts/managed/usdm-settlement/contract/index.js
npm run contract:prepare-browser

echo
echo "[5/5] Browser integration production build"
npm run build
node scripts/verify-via-runtime.mjs

echo
cat <<'EOF'
=== STATIC + BUILD VERIFICATION PASSED ===

Verified locally on Linux:
  ✓ Node 22+
  ✓ @via-labs-tech/usdm-bridge 1.2.0
  ✓ VIA Midnight proving assets copied to /artifacts/midnight
  ✓ public + dist asset manifests agree with actual copied files
  ✓ frontend TypeScript/Vite production build
  ✓ Compact settlement source compilation
  ✓ generated Compact browser adapter
  ✓ final browser integration build

NOT YET PROVEN BY THIS SCRIPT:
  ○ real Midnight Preview wallet-local proving
  ○ real Midnight → Cardano burn/release round trip
  ○ VIA-attributable message evidence
  ○ real Preview Compact deployment/settlement
  ○ independent receipt-state verification

Those remain live-network evidence gates and must be demonstrated in-browser.
EOF
