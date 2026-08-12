#!/usr/bin/env bash
#
# Publish a stripped snapshot of the internal repo to the public GitHub mirror.
#
# The mirror never shares history with the internal repo. Each run exports the
# tracked tree at HEAD (git archive — untracked local junk can't leak), deletes
# every path in scripts/public-exclude.txt, and commits the result onto the
# mirror's own branch as a single sync commit. Structurally, nothing private
# can reach GitHub: its history never contained any of it.
#
# Usage:
#   scripts/publish-github.sh          # sync into the local mirror, push if a
#                                      # remote named "github" is configured
#   ONEREP_PUBLIC_MIRROR=/path ...     # override the mirror location
#
# First-time setup for pushing:
#   git -C .public-mirror remote add github git@github.com:<you>/<repo>.git

set -euo pipefail

root="$(git rev-parse --show-toplevel)"
mirror="${ONEREP_PUBLIC_MIRROR:-$root/.public-mirror}"
exclude_list="$root/scripts/public-exclude.txt"
sha="$(git -C "$root" rev-parse --short HEAD)"

if [ ! -d "$mirror/.git" ]; then
  git init -b main "$mirror"
fi

# Replace the mirror's working tree with the tracked tree at HEAD.
find "$mirror" -mindepth 1 -maxdepth 1 -not -name .git -exec rm -rf {} +
git -C "$root" archive HEAD | tar -x -C "$mirror"

# Strip the private paths.
while IFS= read -r path; do
  case "$path" in ""|\#*) continue ;; esac
  case "$path" in
    /*|*..*) echo "refusing suspicious exclude path: $path" >&2; exit 1 ;;
  esac
  rm -rf "${mirror:?}/$path"
done < "$exclude_list"

# Belt and suspenders: nothing named _private leaves the building.
leftover="$(find "$mirror" -name '_private' -not -path "$mirror/.git/*" | head -1)"
if [ -n "$leftover" ]; then
  echo "a _private path survived the exclude list: $leftover" >&2
  exit 1
fi

git -C "$mirror" add -A
if git -C "$mirror" diff --cached --quiet; then
  echo "mirror already matches internal @ $sha — nothing to publish"
  exit 0
fi
git -C "$mirror" commit -q -m "sync from internal @ $sha"
echo "committed sync from internal @ $sha"

if git -C "$mirror" remote get-url github >/dev/null 2>&1; then
  git -C "$mirror" push github main
else
  echo "no 'github' remote configured in $mirror — skipping push."
  echo "add one with: git -C $mirror remote add github <url>"
fi
