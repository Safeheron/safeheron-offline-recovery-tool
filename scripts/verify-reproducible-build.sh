#!/bin/bash
#
# Reproducible Build Verification Script for Safeheron Offline Recovery Tool
#
# Normalizes a macOS .app bundle (strips code signatures, normalizes timestamps)
# and outputs a deterministic SHA-256 hash. Multiple machines building the same
# git commit should produce the same hash.
#
# Usage:
#   ./scripts/verify-reproducible-build.sh [path-to-.app-or-.dmg]
#
# Full reproducible build workflow:
#   1. All machines: npm run check:build-env  (compare output, ensure match)
#   2. All machines: npm ci && npm run build:reproducible
#   3. All machines: npm run verify:reproducible
#   4. Compare SHA-256 hashes across machines
#   5. Signing machine: sign + notarize, then npm run verify:macos
#

set -euo pipefail

# --- Constants ---
BINARY_NAME="Offline Recovery Tool"

# --- Helpers ---
info()  { echo "  [INFO] $*"; }
warn()  { echo "  [WARN] $*"; }
error() { echo "  [ERROR] $*" >&2; exit 1; }

# --- Cleanup ---
TMPDIR_WORK=""
MOUNT_POINT=""

cleanup() {
    if [ -n "$MOUNT_POINT" ] && [ -d "$MOUNT_POINT" ]; then
        hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    fi
    if [ -n "$TMPDIR_WORK" ] && [ -d "$TMPDIR_WORK" ]; then
        rm -rf "$TMPDIR_WORK"
    fi
}
trap cleanup EXIT

# --- Argument parsing ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_APP="$PROJECT_DIR/src-tauri/target/universal-apple-darwin/release/bundle/macos/Offline Recovery Tool.app"

if [ $# -eq 0 ]; then
    INPUT="$DEFAULT_APP"
    info "Using default build path: $INPUT"
elif [ $# -eq 1 ]; then
    INPUT="$1"
else
    echo "Usage: $0 [path-to-.app-or-.dmg]"
    echo ""
    echo "Normalizes a macOS build and outputs a deterministic SHA-256 hash"
    echo "for reproducible build verification."
    echo ""
    echo "If no path is given, defaults to:"
    echo "  src-tauri/target/universal-apple-darwin/release/bundle/macos/Offline Recovery Tool.app"
    exit 1
fi

if [ ! -e "$INPUT" ]; then
    error "Input does not exist: $INPUT"
fi

TMPDIR_WORK=$(mktemp -d)

# --- Step 1: Extract .app ---
echo "================================================================"
echo "Step 1: Extracting .app bundle..."

WORK_APP="$TMPDIR_WORK/app"

if [[ "$INPUT" == *.dmg ]]; then
    MOUNT_POINT="$TMPDIR_WORK/mount"
    mkdir -p "$MOUNT_POINT"
    info "Mounting DMG: $INPUT"
    hdiutil attach "$INPUT" -nobrowse -readonly -mountpoint "$MOUNT_POINT" -quiet

    APP_IN_DMG=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -n 1)
    if [ -z "$APP_IN_DMG" ]; then
        error "No .app bundle found inside DMG"
    fi
    info "Found: $(basename "$APP_IN_DMG")"
    cp -R "$APP_IN_DMG" "$WORK_APP"

    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    MOUNT_POINT=""
elif [[ -d "$INPUT" && "$INPUT" == *.app ]]; then
    info "Copying .app bundle: $INPUT"
    cp -R "$INPUT" "$WORK_APP"
else
    error "Input must be a .app directory or .dmg file"
fi

# Verify it looks like a valid .app
if [ ! -f "$WORK_APP/Contents/MacOS/$BINARY_NAME" ]; then
    error "Invalid .app bundle: missing Contents/MacOS/$BINARY_NAME"
fi

info "Working copy ready at: $WORK_APP"

# --- Step 2: Strip code signatures ---
echo "================================================================"
echo "Step 2: Stripping code signatures..."

# First apply ad-hoc signature to normalize the binary state.
# This ensures both signed and unsigned binaries end up in the
# same byte-identical state before stripping (signing modifies
# metadata bytes that must be normalized this way).
codesign --sign - --force --deep "$WORK_APP" 2>/dev/null || true

# Remove signatures from every Mach-O in the bundle
# (main executable, nested frameworks, dylibs, helper executables, etc.)
while IFS= read -r f; do
    if file "$f" 2>/dev/null | grep -qE "Mach-O"; then
        codesign --remove-signature "$f" 2>/dev/null || true
    fi
done < <(find "$WORK_APP" -type f)

find "$WORK_APP" -name "_CodeSignature" -type d -exec rm -rf {} + 2>/dev/null || true
find "$WORK_APP" -name "CodeResources" -delete 2>/dev/null || true

info "Code signatures removed"

# --- Step 3: Normalize Info.plist ---
echo "================================================================"
echo "Step 3: Normalizing Info.plist..."

PLIST="$WORK_APP/Contents/Info.plist"
if [ -f "$PLIST" ]; then
    plutil -convert xml1 "$PLIST"
    /usr/libexec/PlistBuddy -c "Set :CFBundleVersion NORMALIZED" "$PLIST" 2>/dev/null || true
    info "CFBundleVersion normalized"
else
    warn "Info.plist not found, skipping"
fi

# --- Step 4: Compute deterministic hash ---
echo "================================================================"
echo "Step 4: Computing deterministic hash..."

# Generate sorted list of relative paths + per-file SHA-256, then hash the whole list
HASH=$(cd "$WORK_APP" && find . -type f | LC_ALL=C sort | while IFS= read -r file; do
    shasum -a 256 "$file"
done | shasum -a 256 | awk '{print $1}')

# --- Step 5: Collect metadata ---
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$WORK_APP/Contents/Info.plist" 2>/dev/null || echo "unknown")
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

# --- Output ---
echo "================================================================"
echo ""
echo "=== Reproducible Build Verification ==="
echo "SHA-256:    $HASH"
echo "Git Commit: $GIT_COMMIT"
echo "Product:    $BINARY_NAME v$VERSION"
echo ""
echo "Compare this hash with other build machines."
echo "Matching hashes confirm the builds are identical."
echo "========================================"
