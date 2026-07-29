#!/bin/bash
#
# macOS Signature & Notarization Inspector
#
# For .app: checks signature identity and Gatekeeper acceptance (signature + notarization).
# For .dmg: mounts the image, finds the inner .app, and checks that instead.
#
# Notarization tickets are stapled on the .app, not the DMG — so the meaningful
# check is always `spctl --assess --type execute` on the .app bundle.
#
# Usage:
#   ./scripts/inspect-signature.sh [--summary] <path-to-.app-or-.dmg>
#
# Exits 0 after printing the report. Exits non-zero only on usage errors.
#

set -euo pipefail

# --- Cleanup ---
_MOUNT_POINT=""
_TMPDIR=""
cleanup() {
    if [ -n "$_MOUNT_POINT" ] && [ -d "$_MOUNT_POINT" ]; then
        hdiutil detach "$_MOUNT_POINT" -force -quiet 2>/dev/null || true
    fi
    if [ -n "$_TMPDIR" ] && [ -d "$_TMPDIR" ]; then
        rm -rf "$_TMPDIR"
    fi
}
trap cleanup EXIT

# --- Parse args ---
SUMMARY=0
TARGET=""
for arg in "$@"; do
    case "$arg" in
        --summary) SUMMARY=1 ;;
        -h|--help) echo "Usage: $0 [--summary] <path-to-.app-or-.dmg>"; exit 0 ;;
        *) TARGET="$arg" ;;
    esac
done

if [ -z "$TARGET" ]; then
    echo "Usage: $0 [--summary] <path-to-.app-or-.dmg>" >&2
    exit 1
fi
if [ ! -e "$TARGET" ]; then
    echo "Error: $TARGET does not exist" >&2
    exit 1
fi

# --- Resolve the .app to inspect ---
APP_PATH=""
IS_DMG=0

if [[ "$TARGET" == *.dmg ]]; then
    IS_DMG=1
    _TMPDIR=$(mktemp -d)
    _MOUNT_POINT="$_TMPDIR/mnt"
    mkdir -p "$_MOUNT_POINT"

    if ! hdiutil attach "$TARGET" -nobrowse -readonly -mountpoint "$_MOUNT_POINT" -quiet 2>/dev/null; then
        echo "Error: failed to mount DMG: $TARGET" >&2
        exit 1
    fi

    APP_PATH=$(find "$_MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -n1 || true)
    if [ -z "$APP_PATH" ]; then
        echo "Error: no .app bundle found inside DMG" >&2
        exit 1
    fi
elif [[ "$TARGET" == *.app ]]; then
    APP_PATH="$TARGET"
else
    echo "Error: unsupported file type (expected .app or .dmg)" >&2
    exit 1
fi

# --- Gather signing identity ---
DV_OUT=$(codesign -dvvv "$APP_PATH" 2>&1 || true)

STATE="UNKNOWN"
TYPE="—"
AUTHORITIES=""
TEAM_ID=""

if echo "$DV_OUT" | grep -q "code object is not signed at all"; then
    STATE="UNSIGNED"
elif echo "$DV_OUT" | grep -qE "^Signature=adhoc$"; then
    STATE="SIGNED"
    TYPE="Ad-hoc (no Developer ID)"
else
    STATE="SIGNED"
    AUTHORITIES=$(echo "$DV_OUT" | grep -E "^Authority=" | sed 's/^Authority=//' || true)
    TEAM_ID=$(echo "$DV_OUT" | grep -E "^TeamIdentifier=" | sed 's/^TeamIdentifier=//' | head -n1 || true)

    FIRST_AUTH=$(echo "$AUTHORITIES" | head -n1)
    case "$FIRST_AUTH" in
        "Developer ID Application:"*)   TYPE="Developer ID Application" ;;
        "Apple Development:"*)          TYPE="Apple Development (local dev only)" ;;
        "Apple Distribution:"*)         TYPE="Apple Distribution (App Store)" ;;
        *)                              TYPE="Other / Unknown" ;;
    esac
fi

# --- Gatekeeper assessment (the definitive check: signature + notarization) ---
GK_OK=0
GK_OUT=""
if [ "$STATE" != "UNSIGNED" ]; then
    if GK_OUT=$(spctl --assess --verbose=4 --type execute "$APP_PATH" 2>&1); then
        GK_OK=1
    fi
fi

# --- Render output ---
APP_NAME=$(basename "$APP_PATH")

if [ "$SUMMARY" -eq 1 ]; then
    IDENTITY="$TYPE"
    if [ -n "$AUTHORITIES" ]; then
        IDENTITY=$(echo "$AUTHORITIES" | head -n1)
    fi
    if [ -n "$TEAM_ID" ] && [ "$TEAM_ID" != "not set" ]; then
        IDENTITY="$IDENTITY (Team $TEAM_ID)"
    fi

    case "$STATE" in
        UNSIGNED)       STATE_ICON="❌" ;;
        SIGNED)         STATE_ICON="✅" ;;
        *)              STATE_ICON="❌" ;;
    esac
    [ "$GK_OK" -eq 1 ] && GK_ICON="✅" || GK_ICON="❌"

    echo "  $(basename "$TARGET")"
    echo "    $STATE_ICON $STATE — $IDENTITY"
    [ "$IS_DMG" -eq 1 ] && echo "    App: $APP_NAME"
    echo "    Gatekeeper+Notarization: $GK_ICON"
else
    echo "================================================================"
    echo "Signature inspection: $(basename "$TARGET")"
    [ "$IS_DMG" -eq 1 ] && echo "  Source:         DMG → $APP_NAME"
    echo "----------------------------------------------------------------"
    echo "  State:          $STATE"
    echo "  Type:           $TYPE"
    if [ -n "$TEAM_ID" ] && [ "$TEAM_ID" != "not set" ]; then
        echo "  Team ID:        $TEAM_ID"
    fi
    if [ -n "$AUTHORITIES" ]; then
        echo "  Authority chain:"
        echo "$AUTHORITIES" | sed 's/^/    - /'
    fi
    if [ "$STATE" = "UNSIGNED" ]; then
        echo "  Gatekeeper:     N/A (unsigned)"
    elif [ "$GK_OK" -eq 1 ]; then
        echo "  Gatekeeper:     ✅ accepted — signed and notarized"
    else
        echo "  Gatekeeper:     ❌ rejected"
        echo "$GK_OUT" | sed 's/^/                    /'
    fi
    echo "================================================================"
fi
