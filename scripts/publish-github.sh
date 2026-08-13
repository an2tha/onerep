#!/usr/bin/env bash
#
# Publish the internal repo to the public GitHub mirror, one real commit at a
# time.
#
# The mirror never shares object history with the internal repo. Instead,
# every internal commit after $baseline is REPLAYED: its tracked tree is
# exported (git archive — untracked local junk can't leak), the paths in
# scripts/public-exclude.txt are deleted, and the result is committed with the
# original message, author, and dates, plus an Internal-Source trailer that
# records where to resume next run. Public history therefore looks like what
# it is — real development — while structurally never containing a private
# blob.
#
# Merge commits are linearized (--first-parent): a merged branch lands as one
# public commit carrying the merge's tree.
#
# Usage:
#   scripts/publish-github.sh          # replay new commits, push if a remote
#                                      # named "github" is configured
#   ONEREP_PUBLIC_MIRROR=/path ...     # override the mirror location
#
# First-time setup for pushing:
#   git -C .public-mirror remote add github git@github.com:<you>/<repo>.git

set -euo pipefail

root="$(git rev-parse --show-toplevel)"
mirror="${ONEREP_PUBLIC_MIRROR:-$root/.public-mirror}"
exclude_list="$root/scripts/public-exclude.txt"

if [ ! -d "$mirror/.git" ]; then
  git init -q -b main "$mirror"
fi

# Resume after the last replayed commit; with no trailer the mirror is empty
# (or from the old squash era) and the whole history gets replayed from the
# root.
last_internal="$({ git -C "$mirror" log -1 --format=%B 2>/dev/null || true; } |
  sed -n 's/^Internal-Source: //p' | tail -1)"
rebuilt=0
if [ -z "$last_internal" ]; then
  git -C "$mirror" update-ref -d refs/heads/main 2>/dev/null || true
  git -C "$mirror" symbolic-ref HEAD refs/heads/main
  range="HEAD"
  rebuilt=1
else
  range="$last_internal..HEAD"
fi

published=0
for rev in $(git -C "$root" rev-list --reverse --first-parent "$range"); do

  # Replace the mirror's working tree with the tracked tree at $rev.
  find "$mirror" -mindepth 1 -maxdepth 1 -not -name .git -exec rm -rf {} +
  git -C "$root" archive "$rev" | tar -x -C "$mirror"

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
  # A commit that only touched excluded paths leaves nothing to say.
  if git -C "$mirror" rev-parse -q --verify HEAD >/dev/null &&
    git -C "$mirror" diff --cached --quiet; then
    continue
  fi

  GIT_AUTHOR_NAME="$(git -C "$root" log -1 --format=%an "$rev")" \
  GIT_AUTHOR_EMAIL="$(git -C "$root" log -1 --format=%ae "$rev")" \
  GIT_AUTHOR_DATE="$(git -C "$root" log -1 --format=%aI "$rev")" \
  GIT_COMMITTER_DATE="$(git -C "$root" log -1 --format=%aI "$rev")" \
    git -C "$mirror" commit -q \
      -m "$(git -C "$root" log -1 --format=%B "$rev")" \
      -m "Internal-Source: $rev"
  published=$((published + 1))
done

if [ "$published" -eq 0 ]; then
  echo "mirror already matches internal @ $(git -C "$root" rev-parse --short HEAD) — nothing to publish"
  exit 0
fi
echo "replayed $published commit(s), mirror now at internal @ $(git -C "$root" rev-parse --short HEAD)"

if git -C "$mirror" remote get-url github >/dev/null 2>&1; then
  if [ "$rebuilt" -eq 1 ]; then
    git -C "$mirror" push --force github main
  else
    git -C "$mirror" push github main
  fi
else
  echo "no 'github' remote configured in $mirror — skipping push."
  echo "add one with: git -C $mirror remote add github <url>"
fi
