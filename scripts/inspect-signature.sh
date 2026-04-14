#!/bin/bash
#
# macOS Signature Inspection Script for Safeheron Offline Recovery Tool
#
# Inspects the code-signing state of a .app bundle or .dmg and reports:
#   - Signature state:  UNSIGNED | SIGNED | SIGNED-INVALID
#   - Signature type:   Ad-hoc | Developer ID | Apple Development | Other
#   - Signing identity: Common Name + Team ID + full Authority chain
#   - Validity:         result of codesign --verify
#   - Gatekeeper:       result of spctl --assess
#   - Notarization:     presence of a stapled ticket
#
# Usage:
#   ./scripts/inspect-signature.sh <path-to-.app-or-.dmg>
#
# Always exits 0 after printing a report (informational tool — does not gate).
# Exits non-zero only on usage errors or when the target path does not exist.
#

set -euo pipefail

SUMMARY=0
TARGET=""
for arg in "$@"; do
    case "$arg" in
        --summary) SUMMARY=1 ;;
        -h|--help)
            echo "Usage: $0 [--summary] <path-to-.app-or-.dmg>"
            exit 0
            ;;
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

if [ "$SUMMARY" -eq 0 ]; then
    echo "================================================================"
    echo "Signature inspection: $TARGET"
    echo "----------------------------------------------------------------"
fi

# --- Gather codesign display output ---
# codesign -d writes to stderr; merge to stdout for grepping.
DV_OUT=$(codesign -dvvv "$TARGET" 2>&1 || true)

# --- Determine state & type ---
STATE="UNKNOWN"
TYPE="—"
AUTHORITIES=""
TEAM_ID=""

if echo "$DV_OUT" | grep -q "code object is not signed at all"; then
    STATE="UNSIGNED"
elif echo "$DV_OUT" | grep -qE "^Signature=adhoc$"; then
    STATE="SIGNED"
    TYPE="Ad-hoc (no Developer ID — will be rejected by Gatekeeper on other machines)"
else
    STATE="SIGNED"
    AUTHORITIES=$(echo "$DV_OUT" | grep -E "^Authority=" | sed 's/^Authority=//' || true)
    TEAM_ID=$(echo "$DV_OUT" | grep -E "^TeamIdentifier=" | sed 's/^TeamIdentifier=//' | head -n1 || true)

    FIRST_AUTH=$(echo "$AUTHORITIES" | head -n1)
    case "$FIRST_AUTH" in
        "Developer ID Application:"*)   TYPE="Developer ID Application" ;;
        "Apple Development:"*)          TYPE="Apple Development (for local dev, not distribution)" ;;
        "Apple Distribution:"*)         TYPE="Apple Distribution (Mac App Store)" ;;
        "Mac Developer:"*)              TYPE="Mac Developer (legacy, not for distribution)" ;;
        *)                              TYPE="Other / Unknown" ;;
    esac
fi

# --- Validity check (doesn't change state for UNSIGNED) ---
VERIFY_ERR=""
if [ "$STATE" != "UNSIGNED" ]; then
    if ! codesign --verify --strict --deep "$TARGET" 2>/dev/null; then
        VERIFY_ERR=$(codesign --verify --strict --deep "$TARGET" 2>&1 || true)
        STATE="SIGNED-INVALID"
    fi
fi

# --- Gatekeeper assessment ---
# .dmg uses spctl --type open; .app uses --type execute.
if [[ "$TARGET" == *.dmg ]]; then
    GK_TYPE="open"
else
    GK_TYPE="execute"
fi
GK_OK=0
GK_OUT=""
if GK_OUT=$(spctl --assess --type "$GK_TYPE" "$TARGET" 2>&1); then
    GK_OK=1
fi

# --- Notarization (stapled ticket) ---
NOTARIZED=0
if xcrun stapler validate "$TARGET" >/dev/null 2>&1; then
    NOTARIZED=1
fi

# --- Render output ---
if [ "$SUMMARY" -eq 1 ]; then
    # One-line summary suitable for embedding in a larger report.
    IDENTITY="$TYPE"
    FIRST_AUTH=""
    if [ -n "$AUTHORITIES" ]; then
        FIRST_AUTH=$(echo "$AUTHORITIES" | head -n1)
    fi
    if [ -n "$FIRST_AUTH" ]; then
        IDENTITY="$FIRST_AUTH"
    fi
    if [ -n "$TEAM_ID" ] && [ "$TEAM_ID" != "not set" ]; then
        IDENTITY="$IDENTITY (Team $TEAM_ID)"
    fi

    case "$STATE" in
        UNSIGNED)       STATE_ICON="❌"; ;;
        SIGNED-INVALID) STATE_ICON="❌"; ;;
        SIGNED)         STATE_ICON="✅"; ;;
        *)              STATE_ICON="? "; ;;
    esac
    [ "$GK_OK" -eq 1 ]    && GK_ICON="✅"    || GK_ICON="❌"
    [ "$NOTARIZED" -eq 1 ] && NOTARY_ICON="✅" || NOTARY_ICON="⚠️ "

    echo "  $(basename "$TARGET")"
    echo "    $STATE_ICON $STATE — $IDENTITY"
    echo "    Gatekeeper: $GK_ICON   Notarization: $NOTARY_ICON"
else
    # Detailed multi-line report.
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
        echo "  Validity:       N/A"
    elif [ "$STATE" = "SIGNED-INVALID" ]; then
        echo "  Validity:       ❌ INVALID"
        echo "$VERIFY_ERR" | sed 's/^/                    /'
    else
        echo "  Validity:       ✅ codesign --verify passed"
    fi
    if [ "$GK_OK" -eq 1 ]; then
        echo "  Gatekeeper:     ✅ accepted (--type $GK_TYPE)"
    else
        echo "  Gatekeeper:     ❌ rejected (--type $GK_TYPE)"
        echo "$GK_OUT" | sed 's/^/                    /'
    fi
    if [ "$NOTARIZED" -eq 1 ]; then
        echo "  Notarization:   ✅ stapled ticket present and valid"
    else
        echo "  Notarization:   ⚠️  no stapled ticket"
    fi
    echo "================================================================"
fi
