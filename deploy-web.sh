#!/usr/bin/env bash
# ============================================================
#  Publish the survey app's web build at a real URL.
#
#  Why this exists: the survey app is an Expo mobile app with
#  no hosted deployment, so "try it in production" meant serving
#  a web export from this workstation (serve-web.mjs on a port,
#  with the origin having to be hand-added to the backend's CORS
#  allowlist).  A published URL takes the local static server out
#  of the loop and lets anyone open the app from a browser.
#
#  Two things this cannot do for you:
#    1. The backend only answers browser calls from origins in
#       its CORS allowlist (config/settings.py).  A new host is
#       NOT on it, so the deploy URL has to be added to the
#       backend's EXTRA_CORS_ORIGINS, or every API call from the
#       published app fails at the CORS layer while the same
#       credentials work in curl.  The script prints the exact
#       value; a *.zeabur.app host needs no change (the settings
#       carry a regex for that domain).
#    2. The build bakes EXPO_PUBLIC_API_URL in at export time.
#       The in-app Server setting still overrides it at runtime.
#
#  Usage:
#    bash deploy-web.sh                  # build + deploy to production
#    bash deploy-web.sh --build-only     # build and stage, no network
#    API_URL=http://192.168.1.103:8000 bash deploy-web.sh
#
#  Deploy step needs either a logged-in CLI (`npx vercel login`)
#  or VERCEL_TOKEN exported.
# ============================================================
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT/fibre-mobile"
OUT_DIR="$APP_DIR/dist"
API_URL="${API_URL:-https://fibre-backend-wml3.onrender.com}"
BUILD_ONLY=0
[ "${1:-}" = "--build-only" ] && BUILD_ONLY=1

cd "$APP_DIR" || exit 1

# ── 1. Export the web build ────────────────────────────────────────────
echo "── 1/3  Exporting the web build"
echo "        API baked in: $API_URL"
rm -rf "$OUT_DIR"
EXPO_PUBLIC_API_URL="$API_URL" npx expo export --platform web --output-dir dist || {
  echo "ERROR: expo export failed — nothing was published."
  exit 1
}

if [ ! -f "$OUT_DIR/index.html" ]; then
  echo "ERROR: $OUT_DIR/index.html is missing; the export did not produce a site."
  exit 1
fi

# ── 2. SPA fallback ───────────────────────────────────────────────────
# A deep link such as /map or /login must return index.html rather than a
# 404.  serve-web.mjs did this in code; a static host needs it declared.
echo "── 2/3  Declaring SPA rewrites (vercel.json)"
cat > "$OUT_DIR/vercel.json" <<'JSON'
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
JSON

if [ "$BUILD_ONLY" = "1" ]; then
  echo "── 3/3  --build-only: skipping the deploy"
  echo "        Staged: $OUT_DIR"
  exit 0
fi

# ── 3. Deploy ─────────────────────────────────────────────────────────
echo "── 3/3  Deploying to Vercel (production)"
if [ -z "${VERCEL_TOKEN:-}" ] && ! npx vercel whoami >/dev/null 2>&1; then
  echo "ERROR: not logged in to Vercel and VERCEL_TOKEN is unset."
  echo "  Either:  npx vercel login"
  echo "  Or:      VERCEL_TOKEN=<token> bash deploy-web.sh"
  exit 1
fi

TOKEN_ARG=()
[ -n "${VERCEL_TOKEN:-}" ] && TOKEN_ARG=(--token "$VERCEL_TOKEN")

DEPLOY_LOG="$(cd "$OUT_DIR" && npx vercel deploy --prod --yes "${TOKEN_ARG[@]}" 2>&1)"
DEPLOY_RC=$?
printf '%s\n' "$DEPLOY_LOG"

if [ "$DEPLOY_RC" -ne 0 ]; then
  echo "ERROR: vercel deploy failed (exit $DEPLOY_RC)."
  exit 1
fi

URL="$(printf '%s\n' "$DEPLOY_LOG" | grep -oE 'https://[A-Za-z0-9._-]+\.(vercel\.app|zeabur\.app)' | tail -1)"

echo
echo "── Published"
[ -n "$URL" ] && echo "   URL: $URL" || echo "   URL: (see the deploy output above)"
echo
case "$URL" in
  *.zeabur.app)
    echo "   CORS: no backend change needed — settings.py already allows *.zeabur.app."
    ;;
  *)
    echo "   CORS: REQUIRED, or sign-in fails in the browser while curl still works."
    echo "         Add this to the Render service's EXTRA_CORS_ORIGINS (comma-separated),"
    echo "         then redeploy/restart the backend:"
    echo "             ${URL:-<deployed-origin>}"
    echo "         Without it the app's calls to https://fibre-backend-wml3.onrender.com"
    echo "         are blocked before they reach Django."
    ;;
esac
