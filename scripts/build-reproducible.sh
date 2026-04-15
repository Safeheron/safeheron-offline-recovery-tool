#!/bin/bash
#
# Reproducible Build Script for Safeheron Offline Recovery Tool
#
# Copies the project to a fixed temporary directory before building,
# ensuring all machines build from the same path regardless of where
# the project is checked out.
#
# Usage:
#   ./scripts/build-reproducible.sh
#

set -euo pipefail

info()  { echo "  [INFO] $*"; }
error() { echo "  [ERROR] $*" >&2; exit 1; }

# --- Required versions ---
REQUIRED_NODE_VERSION="22.16.0"
REQUIRED_RUST_VERSION="1.88.0"
REQUIRED_XCODE_VERSION="26.2"

# --- Environment checks ---
echo "================================================================"
echo "Checking build environment..."

command -v node       >/dev/null 2>&1 || error "Node.js not found."
command -v rustc      >/dev/null 2>&1 || error "rustc not found."
command -v rustup     >/dev/null 2>&1 || error "rustup not found."
command -v xcodebuild >/dev/null 2>&1 || error "xcodebuild not found. Install full Xcode, not just Command Line Tools."

NODE_VERSION_RAW="$(node -v)"
NODE_VERSION="${NODE_VERSION_RAW#v}"
if [[ "$NODE_VERSION" != "$REQUIRED_NODE_VERSION" ]]; then
    error "Node version $NODE_VERSION detected; required $REQUIRED_NODE_VERSION."
fi

RUST_VERSION_RAW="$(rustc -V)"
if [[ "$RUST_VERSION_RAW" != "rustc $REQUIRED_RUST_VERSION"* ]]; then
    error "Rust version '$RUST_VERSION_RAW' detected; required rustc $REQUIRED_RUST_VERSION."
fi

XCODE_ALL="$(xcodebuild -version 2>/dev/null)"
XCODE_VERSION_RAW="${XCODE_ALL%%$'\n'*}"
if [[ "$XCODE_VERSION_RAW" != "Xcode $REQUIRED_XCODE_VERSION"* ]]; then
    error "Xcode version '$XCODE_VERSION_RAW' detected; required Xcode $REQUIRED_XCODE_VERSION."
fi

if rustup component list --installed 2>/dev/null | grep -q "^rust-src"; then
    error "rust-src is installed. Remove it before building: rustup component remove rust-src"
fi

info "Environment checks passed (Node $REQUIRED_NODE_VERSION, Rust $REQUIRED_RUST_VERSION, Xcode $REQUIRED_XCODE_VERSION)"

# --- Fixed build directory (same on all machines) ---
BUILD_DIR="/tmp/safeheron-reproducible-build"
ORIGINAL_DIR="$(pwd)"

# --- Cleanup on exit ---
cleanup() {
    echo ""
    info "Build directory preserved at: $BUILD_DIR"
    info "Build output copied back to: $ORIGINAL_DIR"
}
trap cleanup EXIT

# --- Step 1: Sync project to fixed directory ---
echo "================================================================"
echo "Step 1: Syncing project to fixed build directory..."
info "Source: $ORIGINAL_DIR"
info "Target: $BUILD_DIR"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

rsync -a \
    --exclude='node_modules' \
    --exclude='src-tauri/target' \
    --exclude='.git' \
    "$ORIGINAL_DIR/" "$BUILD_DIR/"

info "Project synced"

# --- Step 2: Install dependencies ---
echo "================================================================"
echo "Step 2: Installing dependencies..."

cd "$BUILD_DIR"

export HUSKY=0
npm ci --prefer-offline --no-audit --no-fund 2>/dev/null || npm ci

info "Dependencies installed"

# --- Step 3: Build ---
echo "================================================================"
echo "Step 3: Building with deterministic flags..."

if [[ -z "${SOURCE_DATE_EPOCH:-}" ]]; then
    if git -C "$ORIGINAL_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        SOURCE_DATE_EPOCH="$(git -C "$ORIGINAL_DIR" log -1 --format=%ct)"
    else
        error "SOURCE_DATE_EPOCH not set and git metadata not available."
    fi
fi

export SOURCE_DATE_EPOCH
export TZ=UTC
export LC_ALL=C
export LANG=C
export CARGO_INCREMENTAL=0

EXTRA_RUSTFLAGS="${RUSTFLAGS:-}"
export RUSTFLAGS="--remap-path-prefix=$BUILD_DIR=. --remap-path-prefix=$HOME=/build${EXTRA_RUSTFLAGS:+ $EXTRA_RUSTFLAGS}"

npx tauri build --target universal-apple-darwin

info "Build complete"

# --- Step 4: Copy results back ---
echo "================================================================"
echo "Step 4: Copying build output back to original directory..."

BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
rm -rf "$ORIGINAL_DIR/$BUNDLE_DIR"
mkdir -p "$ORIGINAL_DIR/$BUNDLE_DIR"
rsync -a "$BUILD_DIR/$BUNDLE_DIR/" "$ORIGINAL_DIR/$BUNDLE_DIR/"

info "Build output copied"

# --- Step 5: Run verification + signature inspection ---
echo "================================================================"
echo "Step 5: Verifying reproducibility and inspecting signature..."

cd "$ORIGINAL_DIR"

DMG_COUNT=$(find "$BUNDLE_DIR/dmg" -maxdepth 1 -name "*.dmg" | wc -l)
if [ "$DMG_COUNT" -eq 0 ]; then
    error "No .dmg found in $BUNDLE_DIR/dmg"
elif [ "$DMG_COUNT" -gt 1 ]; then
    error "Multiple .dmg files found in $BUNDLE_DIR/dmg — expected exactly one. Clean old build artifacts and rebuild."
fi
DMG_PATH=$(find "$BUNDLE_DIR/dmg" -maxdepth 1 -name "*.dmg")

# Write full script output to logs; echo only the concise summary below.
LOG_DIR="$BUILD_DIR/logs"
mkdir -p "$LOG_DIR"
VERIFY_LOG="$LOG_DIR/verify-reproducible.log"
SIGN_LOG="$LOG_DIR/inspect-signature.log"

./scripts/verify-reproducible-build.sh "$DMG_PATH" > "$VERIFY_LOG" 2>&1 \
    || { cat "$VERIFY_LOG"; error "Reproducibility verification failed."; }
./scripts/inspect-signature.sh "$DMG_PATH" > "$SIGN_LOG" 2>&1 \
    || { cat "$SIGN_LOG"; error "Signature inspection failed."; }

# Parse the bits we care about.
HASH_VALUE=$(grep -E "^SHA-256:" "$VERIFY_LOG" | awk '{print $2}' | head -n1)
SIG_STATE=$(grep -E "^  State:" "$SIGN_LOG" | awk '{print $2}' | head -n1)
SIG_VALIDITY=$(grep -E "^  Validity:" "$SIGN_LOG" | sed -E 's/^  Validity:[[:space:]]+//' | head -n1)

echo ""
echo "================================================================"
echo "Build summary"
echo "================================================================"
echo "  DMG:    $DMG_PATH"
echo "  SHA-256: ${HASH_VALUE:-<missing>}"
if [ "$SIG_STATE" = "UNSIGNED" ]; then
    echo "  Signed:  No"
else
    echo "  Signed:  Yes"
    echo "  Validity: ${SIG_VALIDITY:-<unknown>}"
fi
echo ""
info "Full logs: $VERIFY_LOG, $SIGN_LOG"
