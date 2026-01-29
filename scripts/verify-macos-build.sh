#!/bin/bash

SEARCH_DIR="src-tauri/target/universal-apple-darwin/release/bundle/macos"

APP_PATH=$(find "$SEARCH_DIR" -name "*.app" | head -n 1)

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

echo "----------------------------------------------------------------"
echo "Step 2: Verifying DMG Signature..."

# Determine DMG directory based on APP directory
# Assuming structure: .../bundle/macos/*.app -> .../bundle/dmg/*.dmg
DMG_SEARCH_DIR="${SEARCH_DIR%/macos}/dmg"

if [ ! -d "$DMG_SEARCH_DIR" ]; then
  echo "Warning: DMG directory $DMG_SEARCH_DIR does not exist. Skipping DMG verification."
else
  DMG_PATH=$(find "$DMG_SEARCH_DIR" -name "*.dmg" | head -n 1)
  
  if [ -z "$DMG_PATH" ]; then
    echo "Warning: No .dmg file found in $DMG_SEARCH_DIR. Skipping DMG verification."
  else
    echo "Found DMG at: $DMG_PATH"
    
    echo "  > Verifying DMG Code Signature..."
    codesign -dv --verbose=4 "$DMG_PATH"
    DMG_SIG_RESULT=$?
    
    if [ $DMG_SIG_RESULT -ne 0 ]; then
      echo "  ❌ Error: DMG Signature verification failed."
      exit 1
    else
      echo "  ✅ DMG Signature verification passed."
    fi
  fi
fi

echo "----------------------------------------------------------------"
echo "🎉 Build verification successful! The app is signed and notarized, and DMG (if present) is signed."
