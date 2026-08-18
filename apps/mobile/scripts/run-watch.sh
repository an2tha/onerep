#!/usr/bin/env bash
#
# Runs the iPhone app and its Watch app side by side in the simulator.
#
# The fiddly part is that a watch simulator is useless on its own: WatchConnectivity
# only works between the two halves of a *pair*, and Xcode's Run button drives one
# scheme at a time. So this finds a pair, boots both halves, installs both apps,
# and launches them in the order that matters — phone first, because it is the only
# side that produces data, and the watch shows "open OneRep on your iPhone" until
# it has received a context.
#
# Usage:  bun run ios:watch            (build first, then run)
#         bun run ios:watch --no-build (reuse the last build)
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT="ios/App/App.xcodeproj"
PHONE_BUNDLE="com.ananthh.onerep"
WATCH_BUNDLE="com.ananthh.onerep.watchkitapp"

# ── Pick a pair ──────────────────────────────────────────────────────────
# See scripts/pick-pair.py. If it comes back empty there is nothing to run on.
# Note the runtime you land on matters: WKWebView on some beta iOS simulators
# commits no frames at all, which shows up as a plain white app and is not a
# bug in anything you wrote. ONEREP_PAIR=<pair-udid> forces a different one.
read -r PHONE_ID WATCH_ID <<PAIR || true
$(scripts/pick-pair.py)
PAIR

if [ -z "${PHONE_ID:-}" ] || [ -z "${WATCH_ID:-}" ]; then
  echo "No paired iPhone + Apple Watch simulator found." >&2
  echo "Create one: xcrun simctl pair <phone-udid> <watch-udid>" >&2
  echo "or in Xcode: Window > Devices and Simulators > Simulators > +" >&2
  exit 1
fi

echo "Phone $PHONE_ID"
echo "Watch $WATCH_ID"

# ── Build ────────────────────────────────────────────────────────────────────
if [ "${1:-}" != "--no-build" ]; then
  echo "Syncing web assets…"
  bunx cap sync ios
  echo "Building (this also builds and embeds the watch app)…"
  xcodebuild -project "$PROJECT" -scheme App \
    -destination "id=$PHONE_ID" -configuration Debug \
    build CODE_SIGNING_ALLOWED=NO -quiet
fi

PRODUCTS="$(
  xcodebuild -project "$PROJECT" -scheme App -configuration Debug \
    -showBuildSettings -destination "id=$PHONE_ID" 2>/dev/null \
    | awk -F' = ' '/ BUILD_DIR = /{print $2; exit}'
)"
PHONE_APP="$PRODUCTS/Debug-iphonesimulator/App.app"
WATCH_APP="$PHONE_APP/Watch/OneRep Watch App.app"

[ -d "$PHONE_APP" ] || { echo "Missing $PHONE_APP — build first." >&2; exit 1; }
[ -d "$WATCH_APP" ] || { echo "Missing embedded watch app — build first." >&2; exit 1; }

# ── Boot, install, launch ────────────────────────────────────────────────────
# `boot` on an already-booted device exits non-zero, which is not a failure here.
xcrun simctl boot "$PHONE_ID" 2>/dev/null || true
xcrun simctl boot "$WATCH_ID" 2>/dev/null || true
# Resolved through xcode-select rather than by name: on a machine running an
# Xcode beta there is no app called "Simulator" in /Applications. Bringing the
# window up is a convenience, so never let it end the run.
open "$(xcode-select -p)/Applications/Simulator.app" 2>/dev/null || true

echo "Waiting for both simulators…"
xcrun simctl bootstatus "$PHONE_ID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$WATCH_ID" >/dev/null 2>&1 || true

xcrun simctl install "$PHONE_ID" "$PHONE_APP"
xcrun simctl install "$WATCH_ID" "$WATCH_APP"

xcrun simctl launch "$PHONE_ID" "$PHONE_BUNDLE"
xcrun simctl launch "$WATCH_ID" "$WATCH_BUNDLE"

echo
echo "Both running. The watch stays on its empty state until you are signed in"
echo "on the phone — the snapshot is only pushed once there is a user."
