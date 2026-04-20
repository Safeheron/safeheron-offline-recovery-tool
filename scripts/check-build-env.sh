#!/bin/bash
#
# Build Environment Check Script for Safeheron Offline Recovery Tool
#
# Run this on all build machines before starting a reproducible build.
# Compare the output across machines to ensure environments match.
#
# Usage:
#   ./scripts/check-build-env.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Reproducible Build Environment Check ==="
echo ""
echo "macOS:       $(sw_vers -productVersion) ($(sw_vers -buildVersion))"
echo "Kernel:      $(uname -r)"
echo "Xcode:       $(xcodebuild -version 2>/dev/null | head -1 || echo 'NOT FOUND')"
echo "SDK:         $(xcrun --show-sdk-version 2>/dev/null || echo 'NOT FOUND')"
echo "Clang:       $(clang --version 2>/dev/null | head -1 || echo 'NOT FOUND')"
echo ""
echo "Rust:        $(rustc --version 2>/dev/null || echo 'NOT FOUND')"
echo "Cargo:       $(cargo --version 2>/dev/null || echo 'NOT FOUND')"
echo "Toolchain:   $(rustup show active-toolchain 2>/dev/null || echo 'NOT FOUND')"
echo "rust-src:    $(rustup component list --installed 2>/dev/null | grep rust-src || echo 'NOT INSTALLED')"
echo "Targets:     $(rustup target list --installed 2>/dev/null | tr '\n' ', ' | sed 's/,$//')"
echo ""
echo "Node:        $(node --version 2>/dev/null || echo 'NOT FOUND')"
echo "npm:         $(npm --version 2>/dev/null || echo 'NOT FOUND')"
echo ""

cd "$PROJECT_DIR"
echo "Cargo.lock:       $(shasum -a 256 src-tauri/Cargo.lock 2>/dev/null | awk '{print $1}' || echo 'NOT FOUND')"
echo "package-lock.json:$(shasum -a 256 package-lock.json 2>/dev/null | awk '{print $1}' || echo 'NOT FOUND')"
echo "Git commit:       $(git rev-parse HEAD 2>/dev/null || echo 'unknown')"
echo "Git branch:       $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
echo "Git dirty:        $([ -z "$(git status --porcelain 2>/dev/null)" ] && echo 'clean' || echo 'DIRTY - uncommitted changes or untracked files!')"
echo ""
echo "--- Pinned build env (set by build-reproducible.sh) ---"
echo "SOURCE_DATE_EPOCH:       $(git log -1 --format=%ct 2>/dev/null || echo 'unknown')"
echo "MACOSX_DEPLOYMENT_TARGET: 10.13"
echo "TZ:                       UTC"
echo "LC_ALL:                   C"
echo "CARGO_INCREMENTAL:        0"
echo ""
echo "================================================"
echo "Compare this output across all build machines."
echo "All values must match for reproducible builds."
echo "================================================"
