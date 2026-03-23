#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: This script must run on macOS." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REQUIRED_NODE_VERSION="22.16.0"
REQUIRED_RUST_VERSION="1.88.0"
REQUIRED_XCODE_VERSION="26.2"
REQUIRED_TARGETS=("aarch64-apple-darwin" "x86_64-apple-darwin")

fail() {
  echo "Error: $*" >&2
  exit 1
}

info() {
  echo "==> $*"
}

command -v node >/dev/null 2>&1 || fail "Node.js not found."
command -v rustc >/dev/null 2>&1 || fail "rustc not found."
command -v xcodebuild >/dev/null 2>&1 || fail "xcodebuild not found."
command -v hdiutil >/dev/null 2>&1 || fail "hdiutil not found."

NODE_VERSION_RAW="$(node -v)"
NODE_VERSION="${NODE_VERSION_RAW#v}"
if [[ "$NODE_VERSION" != "$REQUIRED_NODE_VERSION" ]]; then
  fail "Node version $NODE_VERSION detected; required $REQUIRED_NODE_VERSION."
fi

RUST_VERSION_RAW="$(rustc -V)"
if [[ "$RUST_VERSION_RAW" != "rustc $REQUIRED_RUST_VERSION"* ]]; then
  fail "Rust version '$RUST_VERSION_RAW' detected; required rustc $REQUIRED_RUST_VERSION."
fi

XCODE_VERSION_RAW="$(xcodebuild -version | head -n 1)"
if [[ "$XCODE_VERSION_RAW" != "Xcode $REQUIRED_XCODE_VERSION"* ]]; then
  fail "Xcode version '$XCODE_VERSION_RAW' detected; required Xcode $REQUIRED_XCODE_VERSION."
fi

if ! command -v rustup >/dev/null 2>&1; then
  fail "rustup not found. Install rustup to manage toolchains and targets."
fi

INSTALLED_TARGETS="$(rustup target list --installed)"
for target in "${REQUIRED_TARGETS[@]}"; do
  if ! echo "$INSTALLED_TARGETS" | grep -qF "$target"; then
    fail "Missing Rust target '$target'. Install via: rustup target add $target"
  fi
done

if [[ -z "${SOURCE_DATE_EPOCH:-}" ]]; then
  if git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    SOURCE_DATE_EPOCH="$(git -C "$ROOT_DIR" log -1 --format=%ct)"
  else
    fail "SOURCE_DATE_EPOCH not set and git metadata not available."
  fi
fi

if ! [[ "$SOURCE_DATE_EPOCH" =~ ^[0-9]+$ ]]; then
  fail "SOURCE_DATE_EPOCH must be an integer (seconds since epoch)."
fi

export SOURCE_DATE_EPOCH
export TZ=UTC
export LC_ALL=C
export LANG=C
export NODE_ENV=production
export HUSKY=0
export CARGO_INCREMENTAL=0
export CARGO_PROFILE_RELEASE_DEBUG=false

EXTRA_RUSTFLAGS="${RUSTFLAGS:-}"
export RUSTFLAGS="--remap-path-prefix=$ROOT_DIR=. -C link-arg=-Wl,-no_uuid${EXTRA_RUSTFLAGS:+ $EXTRA_RUSTFLAGS}"

TOUCH_TIME="$(date -u -r "$SOURCE_DATE_EPOCH" +%Y%m%d%H%M.%S)"

normalize_mtime() {
  local target="$1"
  if [[ ! -e "$target" ]]; then
    fail "Expected path not found: $target"
  fi
  find "$target" -print0 | xargs -0 touch -h -t "$TOUCH_TIME"
}

info "Cleaning previous outputs"
rm -rf dist
rm -rf src-tauri/target

info "Installing dependencies"
export NPM_CONFIG_FUND=false
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_UPDATE_NOTIFIER=false
npm ci

info "Building Tauri app (no DMG)"
export PATH="$ROOT_DIR/node_modules/.bin:$PATH"
npx tauri build --target universal-apple-darwin --bundles app

BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle/macos"
APP_PATH="$(find "$BUNDLE_DIR" -maxdepth 1 -name "*.app" -print | head -n 1)"
if [[ -z "$APP_PATH" ]]; then
  fail "No .app found in $BUNDLE_DIR"
fi

if command -v xattr >/dev/null 2>&1; then
  xattr -cr "$APP_PATH"
fi

normalize_mtime "$APP_PATH"

DMG_DIR="src-tauri/target/universal-apple-darwin/release/bundle/dmg"
mkdir -p "$DMG_DIR"
DMG_NAME="Offline-Recovery-Tool.dmg"
DMG_PATH="$DMG_DIR/$DMG_NAME"
VOLUME_NAME="Offline Recovery Tool"

info "Creating deterministic DMG"
hdiutil create \
  -fs HFS+ \
  -volname "$VOLUME_NAME" \
  -srcfolder "$APP_PATH" \
  -format UDZO \
  -imagekey zlib-level=9 \
  -ov \
  -quiet \
  "$DMG_PATH"

info "Generating SHA256 sums"
APP_HASH="$(
  find "$APP_PATH" -type f -print \
    | sort \
    | while read -r file_path; do
        shasum -a 256 "$file_path"
      done \
    | shasum -a 256 \
    | awk '{print $1}'
)"
DMG_HASH="$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')"

SUMS_PATH="$DMG_DIR/SHA256SUMS.txt"
{
  echo "${APP_HASH}  $(basename "$APP_PATH") (composite)"
  echo "${DMG_HASH}  $(basename "$DMG_PATH")"
} > "$SUMS_PATH"

info "Done"
echo "App: $APP_PATH"
echo "DMG: $DMG_PATH"
echo "SHA256: $SUMS_PATH"
