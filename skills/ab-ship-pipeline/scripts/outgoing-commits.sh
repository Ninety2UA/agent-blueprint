#!/usr/bin/env bash
# outgoing-commits.sh — the commits a push would publish, for the secret scan and the CI check:
# bash and git only. The ship runner lists them at publish time, and the ab-ship-pipeline skill
# lists them before an interactive publish, so both paths scan the same commits.
#
# Usage: outgoing-commits.sh PUSH_URL BASE [COMMIT]
#   PUSH_URL   where the push goes, as `git remote get-url --push <remote>` prints it
#   BASE       an ancestor of COMMIT; every commit in BASE..COMMIT is listed, whatever the
#              remote holds, because a commit leaves the remote-relative list as soon as any
#              branch at PUSH_URL has it (a session can push it, or merge a published branch)
#   COMMIT     the commit the push sends (default HEAD)
#
# Prints one full commit hash per line, oldest first, as scan-secrets.sh --commits reads them:
# BASE and every older commit that no branch at PUSH_URL has, then every commit in BASE..COMMIT.
# The branches are read live with git ls-remote, so a stale tracking ref, or a fetch URL that
# differs from the push URL, cannot hide a commit. A branch tip this clone lacks is fetched first
# (its objects only; no ref or FETCH_HEAD is written), so commits a branch gained since the last
# fetch count as published.
#
# Exit: 0 = listed · 1 = PUSH_URL could not be read · 2 = usage or git error

set -euo pipefail

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }
die() { echo "outgoing-commits: $1" >&2; exit 2; }

case "${1:-}" in -h|--help) usage; exit 0 ;; esac
if [ $# -lt 2 ] || [ $# -gt 3 ]; then usage >&2; exit 2; fi
# An argument that starts with - would reach git as an option (ls-remote --upload-pack=..., say).
# The URL is never printed: it may carry a credential.
case "$1" in ''|-*) die "PUSH_URL must be a URL or a path" ;; esac
for rev in "$2" "${3:-HEAD}"; do
    case "$rev" in ''|-*) die "not a commit: $rev" ;; esac
done
url="$1"
base=$(git rev-parse -q --verify "$2^{commit}") || die "not a commit: $2"
tip=$(git rev-parse -q --verify "${3:-HEAD}^{commit}") || die "not a commit: ${3:-HEAD}"
git merge-base --is-ancestor "$base" "$tip" || die "$2 is not an ancestor of ${3:-HEAD}"

heads=$(git ls-remote --heads "$url" 2>/dev/null) || exit 1
tips=$(printf '%s\n' "$heads" | cut -f1 | grep -E '^[0-9a-f]{40,64}$' || true)
types=""
if [ -n "$tips" ]; then
    types=$(printf '%s\n' "$tips" | git cat-file --batch-check='%(objectname) %(objecttype)') || exit 2
    missing=$(printf '%s\n' "$types" | sed -n 's/ missing$//p')
    if [ -n "$missing" ]; then
        printf '%s\n' "$missing" | git -c core.hooksPath=/dev/null fetch --quiet --no-tags --no-recurse-submodules --no-write-fetch-head --stdin "$url" >/dev/null 2>&1 || exit 1
        types=$(printf '%s\n' "$tips" | git cat-file --batch-check='%(objectname) %(objecttype)') || exit 2
    fi
fi

# BASE and the older commits no branch has. Each is an ancestor of BASE, so none descends from a
# commit in BASE..COMMIT, and listing them first keeps the whole list oldest first.
{
    printf '%s\n' "$base"
    if [ -n "$types" ]; then printf '%s\n' "$types" | sed -n 's/^\([0-9a-f]*\) commit$/^\1/p'; fi
} | git rev-list --reverse --stdin || exit 2
git rev-list --reverse "$base..$tip" || exit 2
