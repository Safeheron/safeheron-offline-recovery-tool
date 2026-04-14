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
warn()  { echo "  [WARN] $*"; }
error() { echo "  [ERROR] $*" >&2; exit 1; }

# --- Pinned deterministic build environment ---
# Kept identical across machines so embedded timestamps, locale-sensitive
# strings, and Mach-O load commands stay byte-identical.
export MACOSX_DEPLOYMENT_TARGET="10.13"
export TZ="UTC"
export LC_ALL="C"
export CARGO_INCREMENTAL="0"

# SOURCE_DATE_EPOCH: commit time of HEAD in the source repo. Must be computed
# BEFORE cd-ing to BUILD_DIR, since .git is excluded from the rsync.
if SOURCE_DATE_EPOCH="$(git -C "$ORIGINAL_DIR" log -1 --format=%ct 2>/dev/null)"; then
    export SOURCE_DATE_EPOCH
else
    error "Cannot determine SOURCE_DATE_EPOCH: '$ORIGINAL_DIR' is not a git repo or has no commits."
fi

# Note: BUILD_DIR is preserved after exit for post-mortem inspection;
# next invocation of this script wipes it in Step 1.

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
info "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH  MACOSX_DEPLOYMENT_TARGET=$MACOSX_DEPLOYMENT_TARGET"
info "TZ=$TZ  LC_ALL=$LC_ALL  CARGO_INCREMENTAL=$CARGO_INCREMENTAL"

RUSTFLAGS="--remap-path-prefix=$HOME=/build" ./node_modules/.bin/tauri build --target universal-apple-darwin

info "Build complete"

# --- Step 4: Copy results back ---
echo "================================================================"
echo "Step 4: Copying build output back to original directory..."

BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
mkdir -p "$ORIGINAL_DIR/$BUNDLE_DIR"
rsync -a "$BUILD_DIR/$BUNDLE_DIR/" "$ORIGINAL_DIR/$BUNDLE_DIR/"

info "Build output copied"

# --- Step 5: Final summary (hash + signature status) ---
cd "$ORIGINAL_DIR"

# Compute the reproducible hash silently and save per-file manifest for
# cross-machine diff.  If anything goes wrong, replay the full child-script
# output so the failure is visible rather than swallowed.
MANIFEST_PATH="$ORIGINAL_DIR/$BUNDLE_DIR/manifest.txt"
BUILD_ENV_PATH="$ORIGINAL_DIR/$BUNDLE_DIR/build-env.txt"
VERIFY_LOG=$(./scripts/verify-reproducible-build.sh --manifest "$MANIFEST_PATH" 2>&1) || {
    echo "$VERIFY_LOG"
    error "verify-reproducible-build.sh failed — see output above."
}
HASH=$(echo "$VERIFY_LOG" | grep -E "^SHA-256:" | awk '{print $2}')
[ -n "$HASH" ] || { echo "$VERIFY_LOG"; error "Could not extract SHA-256 hash from verify output."; }

# Snapshot the build environment next to the manifest for cross-machine diff.
./scripts/check-build-env.sh > "$BUILD_ENV_PATH" 2>&1 || true

GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo unknown)

APP_OUT="$ORIGINAL_DIR/$BUNDLE_DIR/macos/Offline Recovery Tool.app"
DMG_OUT=$(find "$ORIGINAL_DIR/$BUNDLE_DIR/dmg" -maxdepth 1 -name "*.dmg" 2>/dev/null | head -n 1 || true)

echo ""
echo "================================================================"
echo "  Reproducible build — final summary"
echo "================================================================"
echo "  Git commit:     $GIT_COMMIT"
echo "  SHA-256 hash:   $HASH"
echo "  Manifest:       $MANIFEST_PATH"
echo "  Build env:      $BUILD_ENV_PATH"
echo ""
echo "  Signature status"
echo "  ----------------"
if [ -d "$APP_OUT" ]; then
    ./scripts/inspect-signature.sh --summary "$APP_OUT"
else
    echo "  (no .app found at $APP_OUT)"
fi
echo ""
if [ -n "$DMG_OUT" ] && [ -f "$DMG_OUT" ]; then
    ./scripts/inspect-signature.sh --summary "$DMG_OUT"
else
    echo "  (no .dmg produced)"
fi
# --- DMG integrity verification (signed builds only) ---
# When the .app carries a Developer ID signature, the DMG was also signed
# and notarized by tauri build.  Mount the DMG and verify:
#   - no unexpected files were injected
#   - the .app inside has a valid signature + Gatekeeper acceptance
#   - the .app inside is byte-identical (post-normalization) to bundle/macos/
is_developer_id_signed() {
    codesign -dvvv "$1" 2>&1 | grep -qE "^Authority=Developer ID"
}

if [ -d "$APP_OUT" ] && is_developer_id_signed "$APP_OUT" \
   && [ -n "$DMG_OUT" ] && [ -f "$DMG_OUT" ]; then

    echo ""
    echo "  DMG integrity (Developer ID build detected)"
    echo "  --------------------------------------------"

    DMG_MOUNT=$(mktemp -d)
    dmg_cleanup() { hdiutil detach "$DMG_MOUNT" -quiet 2>/dev/null || true; rm -rf "$DMG_MOUNT"; }
    trap dmg_cleanup EXIT
    hdiutil attach "$DMG_OUT" -nobrowse -readonly -mountpoint "$DMG_MOUNT" -quiet

    # Whitelist check
    ALLOWED='^\.(DS_Store|VolumeIcon\.icns)$|^Applications$|^.*\.app$'
    UNEXPECTED=$(find "$DMG_MOUNT" -maxdepth 1 -not -path "$DMG_MOUNT" \
                 -exec basename {} \; | grep -Ev "$ALLOWED" || true)
    if [ -n "$UNEXPECTED" ]; then
        echo "  ❌ DMG contains unexpected files:"
        echo "$UNEXPECTED" | sed 's/^/       - /'
        dmg_cleanup; trap - EXIT
        exit 1
    fi
    echo "  ✅ DMG contents: only expected files"

    # Locate .app inside DMG
    APP_IN_DMG=$(find "$DMG_MOUNT" -maxdepth 1 -name "*.app" -type d | head -n 1)
    if [ -z "$APP_IN_DMG" ]; then
        echo "  ❌ No .app bundle found inside DMG"
        dmg_cleanup; trap - EXIT
        exit 1
    fi

    # Code signature + Gatekeeper on the .app inside DMG
    if ! codesign --verify --strict "$APP_IN_DMG" 2>/dev/null; then
        echo "  ❌ .app inside DMG: invalid code signature"
        dmg_cleanup; trap - EXIT
        exit 1
    fi
    echo "  ✅ .app inside DMG: valid code signature"

    if ! spctl --assess --type execute "$APP_IN_DMG" 2>/dev/null; then
        echo "  ❌ .app inside DMG: rejected by Gatekeeper"
        dmg_cleanup; trap - EXIT
        exit 1
    fi
    echo "  ✅ .app inside DMG: accepted by Gatekeeper"

    # Consistency: normalized hash of .app inside DMG must equal $HASH
    DMG_VERIFY_LOG=$(./scripts/verify-reproducible-build.sh "$APP_IN_DMG" 2>&1) || true
    HASH_DMG_APP=$(echo "$DMG_VERIFY_LOG" | grep -E "^SHA-256:" | awk '{print $2}')

    dmg_cleanup; trap - EXIT

    if [ -z "$HASH_DMG_APP" ]; then
        echo "  ❌ Failed to compute hash for .app inside DMG"
        exit 1
    elif [ "$HASH" = "$HASH_DMG_APP" ]; then
        echo "  ✅ .app inside DMG matches bundle/macos/ .app"
    else
        echo "  ❌ .app inside DMG does NOT match bundle/macos/ .app"
        echo "       bundle/macos/:  $HASH"
        echo "       inside DMG:     $HASH_DMG_APP"
        exit 1
    fi
fi

echo ""
echo "  When hashes differ across machines:"
echo "    diff build-env-a.txt build-env-b.txt    # what's different in the environment"
echo "    diff manifest-a.txt  manifest-b.txt     # which files differ in the output"
echo "================================================================"
