#!/usr/bin/env bash
# ============================================================
#  Rebuild the survey app APK via EAS and install it on the
#  connected phone.
#
#  Why this exists: the EAS Free plan has a monthly Android
#  build quota. When it resets (Sep 1 2026), run this to ship
#  any pending fixes (e.g. reroute baseline showing the
#  engineer's saved survey geometry) to the phone.
#
#  Usage:
#    EXPO_TOKEN=<your-token> bash rebuild-phone.sh
#    (or export EXPO_TOKEN first)
#
#  Steps:
#    1. Trigger a preview-profile Android build on EAS
#    2. Wait for it to complete (CLI blocks until done)
#    3. Resolve the APK artifact URL (build:view)
#    4. Download the APK to builds/
#    5. adb install -r, launch the app, tail logcat
# ============================================================
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT/fibre-mobile"
BUILD_DIR="$ROOT/builds"
mkdir -p "$BUILD_DIR"

if [ -z "${EXPO_TOKEN:-}" ]; then
  echo "ERROR: EXPO_TOKEN is not set."
  echo "  Export it first:  export EXPO_TOKEN=<your-token>"
  exit 1
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "ERROR: adb not found in PATH — add Android platform-tools."
  exit 1
fi

# ── 0. Pre-flight: show the version we are about to ship ───────────────
cd "$APP_DIR" || exit 1
if command -v python >/dev/null 2>&1; then
  VERSION_INFO=$(python -c "
import json
with open('app.json', encoding='utf-8') as f:
    e = json.load(f).get('expo', {})
print('version=' + str(e.get('version', '?')) + ' versionCode=' + str((e.get('android') or {}).get('versionCode', '?')))
" 2>/dev/null)
  echo "==> Building $VERSION_INFO (must be >= the version installed on the phone,"
  echo "    otherwise adb install -r fails with INSTALL_FAILED_VERSION_DOWNGRADE)"
fi

# ── 1. Trigger the build ────────────────────────────────────────────────
echo "==> Triggering EAS Android build (preview profile) ..."
BUILD_LOG="/tmp/eas_rebuild.log"
npx eas-cli build --platform android --profile preview \
  --non-interactive \
  --message "Rebuild: all survey-app fixes (reroute baseline, snap, re-edit, switcher)" \
  > "$BUILD_LOG" 2>&1

if [ $? -ne 0 ]; then
  echo "!! Build command failed — see $BUILD_LOG"
  echo "   (This is expected before the Free-plan quota resets:"
  echo "    'used its Android builds from the Free plan this month'.)"
  tail -20 "$BUILD_LOG"
  exit 1
fi

# ── 2. Extract build id + artifact URL ─────────────────────────────────
BUILD_URL=$(grep -oE "https://expo.dev/accounts/[^ ]*/builds/[0-9a-f-]+" "$BUILD_LOG" | tail -1)
if [ -z "$BUILD_URL" ]; then
  echo "!! Could not find build URL in log:"
  tail -30 "$BUILD_LOG"
  exit 1
fi
BUILD_ID="${BUILD_URL##*/}"
echo "==> Build queued: $BUILD_URL"

echo "==> Waiting for the build to finish (CLI blocks until done) ..."
# The eas-cli build command above already waited; if it returned, the build
# is done. Resolve the artifact URL:
ARTIFACT_URL=$(npx eas-cli build:view "$BUILD_ID" 2>/dev/null | grep -oE "https://expo.dev/artifacts/eas/[A-Za-z0-9_-]+\.apk" | head -1)
if [ -z "$ARTIFACT_URL" ]; then
  echo "!! Build may still be running or failed. Check: $BUILD_URL"
  echo "   Re-run this script later — it will pick up a fresh build."
  exit 1
fi

# ── 3. Download the APK ────────────────────────────────────────────────
APK="$BUILD_DIR/fibre360-rebuild.apk"
echo "==> Downloading APK from $ARTIFACT_URL"
curl -sL -o "$APK" "$ARTIFACT_URL"
python - "$APK" <<'PY'
import sys
data = open(sys.argv[1], "rb").read()
assert data[:2] == b"PK", "Downloaded file is not a valid APK/zip"
print(f"    APK OK: {len(data)} bytes -> {sys.argv[1]}")
PY
if [ $? -ne 0 ]; then
  echo "!! APK download invalid."
  exit 1
fi

# ── 4. Install + launch + monitor ──────────────────────────────────────
DEVICE=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
if [ -z "$DEVICE" ]; then
  echo "!! No phone connected. APK saved at $APK — install it when the phone is plugged in:"
  echo "      adb install -r $APK"
  exit 1
fi
echo "==> Installing on $DEVICE ..."
adb -s "$DEVICE" install -r "$APK" || { echo "!! Install failed."; exit 1; }
adb -s "$DEVICE" logcat -c 2>/dev/null
adb -s "$DEVICE" shell am force-stop com.fibre360.mobile 2>/dev/null
sleep 1
adb -s "$DEVICE" shell am start -n com.fibre360.mobile/.MainActivity
echo "==> Launched. Tailing logcat for errors (Ctrl+C to stop) ..."
adb -s "$DEVICE" logcat 2>/dev/null | grep -E "ReactNativeJS|FATAL|AndroidRuntime" | grep -vE "ImeTracker|InsetsController"
