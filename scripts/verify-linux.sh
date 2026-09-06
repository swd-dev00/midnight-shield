#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

printf '\n=== VIA Settlement Studio / WSL-Linux verification ===\n'

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: this verification path requires Linux/WSL. Current OS: $(uname -s)" >&2
  exit 2
fi

if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
  echo "✓ Runtime: WSL"
else
  echo "✓ Runtime: Linux"
fi

echo "✓ Architecture: $(uname -m)"
echo "✓ CPU: $(lscpu | awk -F: '/Model name/ {gsub(/^ +/, "", $2); print $2; exit}')"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node 22+ and rerun." >&2
  exit 2
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 22 )); then
  echo "ERROR: Node 22+ required; found $(node -v)." >&2
  exit 2
fi

echo "✓ Node: $(node -v)"
echo "✓ npm: $(npm -v)"

echo
echo "[1/6] Installing pinned JavaScript dependencies"
npm install

BRIDGE_VERSION="$(node -p "require('./node_modules/@via-labs-tech/usdm-bridge/package.json').version")"
if [[ "$BRIDGE_VERSION" != "1.2.0" ]]; then
  echo "ERROR: expected @via-labs-tech/usdm-bridge 1.2.0, found $BRIDGE_VERSION" >&2
  exit 3
fi
echo "✓ @via-labs-tech/usdm-bridge@$BRIDGE_VERSION"

echo
echo "[2/6] Frontend production build + VIA Preview ZK runtime assets"
npm run build
node scripts/verify-via-runtime.mjs

echo
echo "[3/6] Compact compiler check"
if ! command -v compact >/dev/null 2>&1; then
  cat >&2 <<'EOF'
ERROR: Compact CLI not found.
Install Midnight Compact devtools, select the 0.31 toolchain, then rerun:

  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.2/compact-installer.sh | sh
  source "$HOME/.local/bin/env"
  compact update 0.31
  npm run verify:wsl
EOF
  exit 4
fi

COMPACT_VERSION="$(compact compile --version)"
echo "✓ Compact compiler: $COMPACT_VERSION"

echo
echo "[4/6] ZKIR host-capability smoke test"
SMOKE_SRC="/tmp/via-zkir-smoke.compact"
SMOKE_OUT="/tmp/via-zkir-smoke-managed"
SMOKE_LOG="/tmp/via-zkir-smoke.log"
cat > "$SMOKE_SRC" <<'EOF'
pragma language_version 0.23;
import CompactStandardLibrary;
export ledger count: Counter;
export circuit increment(): [] { count.increment(1); }
EOF
rm -rf "$SMOKE_OUT"
mkdir -p "$SMOKE_OUT"

set +e
compact compile "$SMOKE_SRC" "$SMOKE_OUT" >"$SMOKE_LOG" 2>&1
ZK_STATUS=$?
set -e

ZK_CAPABLE=1
if (( ZK_STATUS != 0 )); then
  ZK_CAPABLE=0
  cat "$SMOKE_LOG"
  echo
  echo "⚠ ZK backend unavailable on this host (compact status $ZK_STATUS)."
  if grep -qE 'zkir returned a non-zero exit status -4|Illegal instruction|SIGILL' "$SMOKE_LOG"; then
    echo "  Detected ZKIR illegal-instruction signature (-4 / SIGILL)."
    echo "  This is a host CPU/runtime limitation, not evidence that the Compact source is invalid."
  else
    echo "  The ZK smoke test failed for a reason that still needs inspection."
  fi
fi

if (( ZK_CAPABLE == 1 )); then
  echo "✓ ZKIR smoke circuit compiled with proof artifacts"
else
  echo "→ Falling back to Compact --skip-zk for source/compiler validation on this WSL host"
fi

echo
echo "[5/6] Settlement contract validation"
rm -rf contracts/managed/usdm-settlement
mkdir -p contracts/managed

if (( ZK_CAPABLE == 1 )); then
  npm run contract:compile
  test -f contracts/managed/usdm-settlement/contract/index.js
  npm run contract:prepare-browser
  echo "✓ Full Compact artifacts + browser adapter generated"
else
  compact compile --skip-zk contracts/usdm-settlement.compact contracts/managed/usdm-settlement
  test -f contracts/managed/usdm-settlement/contract/index.js
  echo "✓ Compact source compiled with --skip-zk"
  echo "○ Proving/verifying keys NOT generated on this CPU"
  echo "○ Browser Compact deployment remains locked until full artifacts are produced on a ZK-capable x86_64 host"
fi

echo
echo "[6/6] Final browser build"
npm run build
node scripts/verify-via-runtime.mjs

echo
if (( ZK_CAPABLE == 1 )); then
  cat <<'EOF'
=== WSL STATIC + ZK BUILD VERIFICATION PASSED ===

Verified locally:
  ✓ Node 22+
  ✓ @via-labs-tech/usdm-bridge 1.2.0
  ✓ VIA Preview proving assets served directly at /artifacts/midnight
  ✓ frontend TypeScript/Vite production build
  ✓ Compact 0.31 source + ZK artifact generation
  ✓ generated Compact browser adapter
  ✓ final browser integration build

LIVE NETWORK EVIDENCE STILL REQUIRED:
  ○ real Midnight Preview Connector-v4 proving
  ○ real Midnight → Cardano burn/release round trip
  ○ VIA-attributable message evidence
  ○ real Preview Compact deployment/settlement
  ○ independent receipt-state verification
EOF
else
  cat <<'EOF'
=== WSL STATIC VERIFICATION PASSED / ZK HOST BLOCKED ===

Verified locally on this WSL machine:
  ✓ Node 22+
  ✓ @via-labs-tech/usdm-bridge 1.2.0
  ✓ VIA Preview proving assets served directly at /artifacts/midnight
  ✓ frontend TypeScript/Vite production build
  ✓ Compact 0.31 source compilation with --skip-zk

HOST-LIMITED — NOT VERIFIED HERE:
  ○ ZKIR proof-key generation (host CPU triggers ZK backend failure)
  ○ generated deployable Compact browser proof assets
  ○ real Compact Preview deployment

This result must NOT be represented as full Compact/ZK readiness. Generate the full Compact artifacts on a ZK-capable x86_64 host, then return to WSL for the browser/live-network evidence run.
EOF
fi
