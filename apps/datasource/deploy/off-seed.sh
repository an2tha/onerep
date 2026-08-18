#!/bin/bash
#
# Downloads the Open Food Facts export and imports it, refusing to promote a
# catalog built from a truncated file.
#
# Run it as the `datasource` user so the resulting off.sqlite is readable by the
# service without a chown afterwards, and run it detached — the import takes
# roughly 20 minutes on the 4 GB box and must survive an SSH disconnect:
#
#   systemd-run --unit=off-seed --collect \
#     --uid=datasource --gid=datasource \
#     --property=Nice=10 --property=IOSchedulingClass=idle \
#     --property=MemoryMax=3500M --property=TimeoutStartSec=infinity \
#     /usr/local/sbin/off-seed.sh
#
# Watch it with: journalctl -u off-seed -f
#
set -uo pipefail

. /etc/onerep-datasource/env

URL="${OFF_DUMP_URL:-https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz}"
DUMP="${OFF_DUMP:-$CACHE_DIR/off/openfoodfacts-products.jsonl.gz}"
APP="${OFF_APP_DIR:-/opt/onerep-datasource}"

log() { echo "[$(date -Is)] $*"; }
die() { echo "[$(date -Is)] FATAL: $*" >&2; exit 1; }

mkdir -p "$(dirname "$DUMP")" || die "cannot create $(dirname "$DUMP")"

# The published size, asked for up front so a partial download is detectable.
# Open Food Facts rebuilds this file regularly, so it is never hard-coded.
# Headers are lower-cased before matching rather than relying on awk's
# IGNORECASE, which is a GNU extension this host's mawk does not have. The URL
# redirects, so `-L` returns several header blocks and the *last* content-length
# is the file's — the first belongs to the 302 and is 145 bytes.
log "checking published size"
EXPECTED=$(curl -sIL --max-time 60 "$URL" \
  | tr -d '\r' | tr '[:upper:]' '[:lower:]' \
  | awk -F': ' '/^content-length:/ {v=$2} END {print v}')
case "${EXPECTED:-}" in
  "" | *[!0-9]*) die "could not read Content-Length from $URL (got '${EXPECTED:-}')" ;;
esac
# A redirect body is a few hundred bytes; the dump is gigabytes.
[ "$EXPECTED" -gt 1000000000 ] || die "implausible Content-Length $EXPECTED — read a redirect, not the dump"
log "published size is $EXPECTED bytes"

# `-C -` resumes, so a re-run after an interrupted download continues rather
# than starting the ~12 GB fetch again.
if [ ! -f "$DUMP" ] || [ "$(stat -c %s "$DUMP")" -ne "$EXPECTED" ]; then
  log "downloading $URL"
  curl -sSL --retry 5 --retry-delay 10 -C - -o "$DUMP" "$URL" || die "download failed"
else
  log "existing dump already matches the published size, skipping download"
fi

SIZE=$(stat -c %s "$DUMP")
log "on disk: $SIZE bytes (expected $EXPECTED)"
# A short file still parses as valid JSON lines for as far as it goes, so it
# would import cleanly as a silently incomplete catalog.
[ "$SIZE" -eq "$EXPECTED" ] || die "size mismatch — refusing to import a truncated dump"

log "verifying gzip integrity"
gzip -t "$DUMP" || die "gzip integrity check failed"

log "starting import (this is the long pole, ~20 min)"
cd "$APP" || die "no app directory at $APP"
exec /usr/local/bin/bun run src/cli.ts import off --file "$DUMP"
