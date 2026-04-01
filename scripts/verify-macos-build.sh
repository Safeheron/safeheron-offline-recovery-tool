#!/bin/bash
#
# macOS Build Signature Verification Script for Safeheron Offline Recovery Tool
#
# Verifies code signatures, Gatekeeper acceptance, and consistency between
# the .app in bundle/macos/ and the .app packaged inside the .dmg.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SEARCH_DIR="$PROJECT_DIR/src-tauri/target/universal-apple-darwin/release/bundle/macos"

# --- Cleanup ---
MOUNT_POINT=""
cleanup() {
    if [ -n "$MOUNT_POINT" ] && [ -d "$MOUNT_POINT" ]; then
        hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    fi
}
trap cleanup EXIT

# --- Step 1: Verify .app signature + Gatekeeper ---
APP_PATH=$(find "$SEARCH_DIR" -maxdepth 1 -name "*.app" -type d | head -n 1)

if [ -z "$APP_PATH" ]; then
  echo "Error: No .app file found in $SEARCH_DIR"
  exit 1
fi

echo "Found application at: $APP_PATH"

echo "----------------------------------------------------------------"
echo "Step 1: Verifying App Signature and Gatekeeper Acceptance..."
spctl --assess --verbose=4 --type execute "$APP_PATH"
APP_VERIFY_RESULT=$?

if [ $APP_VERIFY_RESULT -ne 0 ]; then
  echo "❌ Error: App verification failed (spctl rejected the app)."
  echo "Note: This might happen if the app is not notarized or if you are running a self-signed build locally."
  exit 1
else
  echo "✅ App verification passed (Gatekeeper accepted the app)."
fi

# --- Step 2: Verify DMG signature ---
echo "----------------------------------------------------------------"
echo "Step 2: Verifying DMG Signature..."

DMG_SEARCH_DIR="${SEARCH_DIR%/macos}/dmg"

if [ ! -d "$DMG_SEARCH_DIR" ]; then
  echo "Warning: DMG directory $DMG_SEARCH_DIR does not exist. Skipping DMG verification."
  echo "----------------------------------------------------------------"
  echo "🎉 Build verification complete (DMG steps skipped)."
  exit 0
fi

DMG_PATH=$(find "$DMG_SEARCH_DIR" -maxdepth 1 -name "*.dmg" | head -n 1)

if [ -z "$DMG_PATH" ]; then
  echo "Warning: No .dmg file found in $DMG_SEARCH_DIR. Skipping DMG verification."
  echo "----------------------------------------------------------------"
  echo "🎉 Build verification complete (DMG steps skipped)."
  exit 0
fi

echo "Found DMG at: $DMG_PATH"

echo "  > Verifying DMG Code Signature..."
codesign --verify --strict --verbose=4 "$DMG_PATH"
DMG_SIG_RESULT=$?

if [ $DMG_SIG_RESULT -ne 0 ]; then
  echo "  ❌ Error: DMG Signature verification failed."
  exit 1
else
  echo "  ✅ DMG Signature verification passed."
fi

# --- Step 3: Verify .app inside DMG ---
echo "----------------------------------------------------------------"
echo "Step 3: Verifying .app inside DMG..."

MOUNT_POINT=$(mktemp -d)
hdiutil attach "$DMG_PATH" -nobrowse -readonly -mountpoint "$MOUNT_POINT" -quiet

echo "  > Checking DMG contents against whitelist..."
ALLOWED_PATTERN='^\.(DS_Store|VolumeIcon\.icns)$|^Applications$|^.*\.app$'
UNEXPECTED=$(find "$MOUNT_POINT" -maxdepth 1 -not -path "$MOUNT_POINT" -exec basename {} \; | grep -Ev "$ALLOWED_PATTERN" || true)

if [ -n "$UNEXPECTED" ]; then
  echo "  ❌ Error: Unexpected files found in DMG:"
  echo "$UNEXPECTED" | sed 's/^/     - /'
  echo "  DMG may have been tampered with."
  exit 1
else
  echo "  ✅ DMG contains only expected files."
fi

APP_IN_DMG=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -n 1)

if [ -z "$APP_IN_DMG" ]; then
  echo "  ❌ Error: No .app bundle found inside DMG."
  exit 1
fi

echo "  Found .app in DMG: $(basename "$APP_IN_DMG")"

echo "  > Verifying code signature of .app inside DMG..."
codesign --verify --strict --verbose=4 "$APP_IN_DMG"
DMG_APP_SIG_RESULT=$?

if [ $DMG_APP_SIG_RESULT -ne 0 ]; then
  echo "  ❌ Error: .app inside DMG has invalid code signature."
  exit 1
else
  echo "  ✅ .app inside DMG has valid code signature."
fi

echo "  > Verifying Gatekeeper acceptance of .app inside DMG..."
spctl --assess --verbose=4 --type execute "$APP_IN_DMG"
DMG_APP_GK_RESULT=$?

if [ $DMG_APP_GK_RESULT -ne 0 ]; then
  echo "  ❌ Error: .app inside DMG rejected by Gatekeeper."
  exit 1
else
  echo "  ✅ .app inside DMG accepted by Gatekeeper."
fi

# --- Step 4: Consistency check ---
echo "----------------------------------------------------------------"
echo "Step 4: Verifying .app consistency (bundle/macos/ vs inside DMG)..."

HASH_MACOS=$("$SCRIPT_DIR/verify-reproducible-build.sh" "$APP_PATH" 2>/dev/null | grep "SHA-256:" | awk '{print $2}')
HASH_DMG=$("$SCRIPT_DIR/verify-reproducible-build.sh" "$APP_IN_DMG" 2>/dev/null | grep "SHA-256:" | awk '{print $2}')

# Unmount before reporting results
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
MOUNT_POINT=""

if [ -z "$HASH_MACOS" ] || [ -z "$HASH_DMG" ]; then
  echo "  ❌ Error: Failed to compute reproducible build hash."
  echo "  HASH_MACOS=$HASH_MACOS"
  echo "  HASH_DMG=$HASH_DMG"
  exit 1
fi

echo "  bundle/macos/ .app hash: $HASH_MACOS"
echo "  DMG internal .app hash:  $HASH_DMG"

if [ "$HASH_MACOS" != "$HASH_DMG" ]; then
  echo "  ❌ Error: .app inside DMG does NOT match bundle/macos/ .app!"
  echo "  The .app may have been tampered with during DMG packaging."
  exit 1
else
  echo "  ✅ .app inside DMG matches bundle/macos/ .app."
fi

echo "----------------------------------------------------------------"
echo "🎉 Build verification successful!"
echo "   - App is signed and notarized"
echo "   - DMG is signed"
echo "   - .app inside DMG is signed and notarized"
echo "   - .app inside DMG matches bundle/macos/ .app"
