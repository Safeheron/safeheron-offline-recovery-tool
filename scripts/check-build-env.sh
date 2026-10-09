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

# `cmd | head -1` is unsafe under `set -o pipefail`: head exits after the first
# line, and if the producer writes anything after that it dies of SIGPIPE, the
# pipeline reports 141, and the trailing `|| echo 'NOT FOUND'` prints a bogus
# line *after* a perfectly good version string. Whether it bites is a race on
# whether the producer finishes writing before head closes the pipe — measured
# at roughly 1 run in 30 for `xcodebuild -version`, i.e. exactly the kind of
# flake nobody wants to chase. Take the first line with parameter expansion
# instead, and keep stderr so a genuine failure explains itself (e.g.
# xcodebuild refusing to run because only the Command Line Tools are
# installed).
first_line() {
    local out
    if out="$("$@" 2>&1)"; then
        printf '%s' "${out%%$'\n'*}"
    else
        printf 'NOT AVAILABLE — %s' "${out%%$'\n'*}"
    fi
}

echo "=== Reproducible Build Environment Check ==="
echo ""
echo "macOS:       $(sw_vers -productVersion) ($(sw_vers -buildVersion))"
echo "Kernel:      $(uname -r)"
echo "Xcode:       $(first_line xcodebuild -version)"
echo "SDK:         $(xcrun --show-sdk-version 2>/dev/null || echo 'NOT FOUND')"
echo "Clang:       $(first_line clang --version)"
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
echo "TZ:                       UTC"
echo "LC_ALL:                   C"
echo "CARGO_INCREMENTAL:        0"
echo ""
# build-reproducible.sh does NOT set this, despite an earlier version of this
# script printing a hardcoded "10.13" under the pinned list above. If it is set
# in the shell it really does affect the build, and it must therefore match
# across machines — so report what is actually in the environment.
echo "--- Not pinned by the build script; must match across machines ---"
echo "MACOSX_DEPLOYMENT_TARGET: ${MACOSX_DEPLOYMENT_TARGET:-<not set>}"
echo ""
echo "================================================"
echo "Compare this output across all build machines."
echo "All values must match for reproducible builds."
echo "================================================"
