#!/usr/bin/env bash
# Builds the release APK with the web bundle guaranteed fresh.
#
# Why this exists: `node node_modules/@capacitor/cli/dist/index.js sync` is a
# silent no-op — dist/index.js only *exports* run(), it never calls it. Only
# bin/capacitor (or the `cap`/`npx cap` shims) actually invoke the CLI. A sync
# that silently did nothing meant the APK could embed a stale or missing web
# bundle while every step "succeeded" with exit 0.
#
# This script always rebuilds dist/, always syncs through the real CLI entry,
# and refuses to run Gradle unless the freshly built bundle hash is present in
# android/app/src/main/assets/public/ — the path Capacitor's WebView actually
# serves from.
#
# Usage: bash scripts/build-android.sh [gradle args...]
#   (default: assembleRelease)

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

GRADLE_TASK="${1:-assembleRelease}"

# ── 1. Web bundle ────────────────────────────────────────────────────────────
echo "==> Building web bundle (dist/)"
if command -v bun >/dev/null 2>&1; then
  bun run build
else
  npm run build
fi

DIST_INDEX="$(ls dist/index.html)"
DIST_BUNDLE="$(ls dist/assets/index-*.js | head -1)"
DIST_BUNDLE_NAME="$(basename "$DIST_BUNDLE")"
echo "    dist bundle: $DIST_BUNDLE_NAME"

# ── 2. Capacitor sync — through the real CLI entry ───────────────────────────
# dist/index.js does not self-execute; bin/capacitor does.
CAP_CLI="node_modules/@capacitor/cli/bin/capacitor"
echo "==> Capacitor sync (via $CAP_CLI)"
node "$CAP_CLI" sync android

# ── 3. Verify the sync actually happened ─────────────────────────────────────
ASSETS_PUBLIC="android/app/src/main/assets/public"
COPIED_BUNDLE="$ASSETS_PUBLIC/assets/$DIST_BUNDLE_NAME"
if [ ! -f "$COPIED_BUNDLE" ]; then
  echo "FATAL: synced assets do not contain the fresh web bundle." >&2
  echo "  expected: $COPIED_BUNDLE" >&2
  echo "  The APK would have shipped a stale or missing UI. Aborting." >&2
  exit 1
fi
if ! cmp -s "$DIST_INDEX" "$ASSETS_PUBLIC/index.html"; then
  echo "FATAL: $ASSETS_PUBLIC/index.html does not match dist/index.html." >&2
  exit 1
fi
echo "    verified: $ASSETS_PUBLIC matches dist/ (bundle $DIST_BUNDLE_NAME)"

# ── 4. Gradle ────────────────────────────────────────────────────────────────
# Pick a JDK when none is exported: Android builds need JAVA_HOME, and a bare
# Windows shell often has neither java on PATH nor JAVA_HOME set.
if [ -z "${JAVA_HOME:-}" ]; then
  if command -v java >/dev/null 2>&1; then
    # Resolve symlinks first: /usr/bin/java is an alternatives symlink on many
    # Linux installs, and two naive dirname steps would yield /usr, which
    # Gradle rejects as a Java home.
    JAVA_BIN="$(readlink -f "$(command -v java)" 2>/dev/null || command -v java)"
    JAVA_HOME="$(dirname "$(dirname "$JAVA_BIN")")"
  elif ls "$HOME"/.jdks/*/bin/java.exe >/dev/null 2>&1; then
    JAVA_HOME="$(ls -d "$HOME"/.jdks/*/ | sort | tail -1 | sed 's:/$::')"
  fi
  [ -n "${JAVA_HOME:-}" ] && export JAVA_HOME && echo "    JAVA_HOME: $JAVA_HOME"
fi

echo "==> Gradle $GRADLE_TASK"
cd android
bash ./gradlew "$GRADLE_TASK"
cd "$APP_DIR"

APK="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK" ]; then
  echo "==> APK ready: $APP_DIR/$APK"
  ls -lh "$APK" | awk '{print "    size:", $5}'
fi
