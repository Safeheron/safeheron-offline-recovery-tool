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

# --- Fixed build directory (same on all machines) ---
BUILD_DIR="/tmp/safeheron-reproducible-build"
ORIGINAL_DIR="$(pwd)"

info()  { echo "  [INFO] $*"; }
error() { echo "  [ERROR] $*" >&2; exit 1; }

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
npm ci --prefer-offline --no-audit --no-fund 2>/dev/null || npm ci

info "Dependencies installed"

# --- Step 3: Build ---
echo "================================================================"
echo "Step 3: Building with deterministic flags..."

RUSTFLAGS="--remap-path-prefix=$HOME=/build" tauri build --target universal-apple-darwin

info "Build complete"

# --- Step 4: Copy results back ---
echo "================================================================"
echo "Step 4: Copying build output back to original directory..."

BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
mkdir -p "$ORIGINAL_DIR/$BUNDLE_DIR"
rsync -a "$BUILD_DIR/$BUNDLE_DIR/" "$ORIGINAL_DIR/$BUNDLE_DIR/"

info "Build output copied"

# --- Step 5: Run verification ---
echo "================================================================"
echo "Step 5: Running reproducible build verification..."

cd "$ORIGINAL_DIR"
./scripts/verify-reproducible-build.sh
