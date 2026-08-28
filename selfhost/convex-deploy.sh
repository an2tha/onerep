#!/usr/bin/env sh
#
# Deploys Convex functions and sets deployment env vars, then exits. Run
# inside the convex-deploy image by install.sh, once per install/update.
#
# Required: CONVEX_SELF_HOSTED_URL, CONVEX_SELF_HOSTED_ADMIN_KEY
# Optional: APP_URL, BETTER_AUTH_SECRET, DATASOURCE_API_TOKEN,
#           OPENROUTER_API_KEY

set -eu

: "${CONVEX_SELF_HOSTED_URL:?CONVEX_SELF_HOSTED_URL is required}"
: "${CONVEX_SELF_HOSTED_ADMIN_KEY:?CONVEX_SELF_HOSTED_ADMIN_KEY is required}"

cd /repo

# Installs the checked-in billing stubs if the private provider is absent, so
# the deploy bundles cleanly on a fresh clone.
bun scripts/ensure-billing-provider.mjs
bunx convex deploy -y

set_env() { # name value — skips empty values so optional keys stay unset
  if [ -n "$2" ]; then
    bunx convex env set "$1" -- "$2"
  fi
}
set_env SITE_URL              "${APP_URL:-}"
set_env BETTER_AUTH_SECRET    "${BETTER_AUTH_SECRET:-}"
set_env DATASOURCE_URL        "http://datasource:3100"
set_env DATASOURCE_API_TOKEN  "${DATASOURCE_API_TOKEN:-}"
set_env OPENROUTER_API_KEY    "${OPENROUTER_API_KEY:-}"
set_env AI_PROCESSOR_APPROVED "${OPENROUTER_API_KEY:+true}"
# You run the inference bill here, so the monthly AI request caps that protect
# the hosted app's wallet have nothing to protect. Off by default on selfhost.
set_env AI_USAGE_UNLIMITED    "true"

echo "Convex functions deployed."
