#!/usr/bin/env bash
#
# Publish the internal repo to the public GitHub mirror with full history —
# branches, merges, and all — minus the paths in scripts/public-exclude.txt.
#
# Each run makes a fresh local clone of main, runs git filter-repo to strip
# the excluded paths from every commit, and pushes the result. filter-repo is
# deterministic: unchanged history prefixes rewrite to identical hashes, so
# after the first force-push every subsequent publish is a fast-forward.
# Commits left empty by the stripping (marketing-only work) are pruned.
#
# The excluded paths never exist in any published object, past or present.
# That is the entire security model, so public-exclude.txt is the one file to
# think hard about before editing.
#
# Usage:
#   scripts/publish-github.sh                # rewrite and push
#   ONEREP_PUBLIC_REMOTE=<url> ...           # override the destination
#
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
exclude_list="$root/scripts/public-exclude.txt"
remote="${ONEREP_PUBLIC_REMOTE:-git@github.com:an2tha/onerep.git}"

command -v git-filter-repo >/dev/null || {
  echo "git-filter-repo is required: brew install git-filter-repo" >&2
  exit 1
}

# Build the --path arguments from the exclude list.
path_args=()
while IFS= read -r path; do
  case "$path" in ""|\#*) continue ;; esac
  case "$path" in
    /*|*..*) echo "refusing suspicious exclude path: $path" >&2; exit 1 ;;
  esac
  path_args+=(--path "$path")
done < "$exclude_list"

tmp="$(mktemp -d /tmp/onerep-public.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

git clone -q --single-branch --branch main "$root" "$tmp/repo"
# --force because the hardlinked local clone trips filter-repo's fresh-clone
# heuristic; the clone one line up is as fresh as they come.
git -C "$tmp/repo" filter-repo --quiet --force --invert-paths "${path_args[@]}"

# Belt and suspenders: no excluded path may appear anywhere in the rewrite.
while IFS= read -r path; do
  case "$path" in ""|\#*) continue ;; esac
  if [ -n "$(git -C "$tmp/repo" log --all --format= --name-only -- "$path" | head -1)" ]; then
    echo "excluded path survived the rewrite: $path" >&2
    exit 1
  fi
done < "$exclude_list"

count="$(git -C "$tmp/repo" rev-list --count main)"
echo "rewrote history: $count public commits from internal @ $(git -C "$root" rev-parse --short HEAD)"

git -C "$tmp/repo" push --force "$remote" main
