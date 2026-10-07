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
# fetch count as published. git ls-remote and git fetch apply url.<base>.insteadOf rules to the URL
# they are given, or take it for the name of a remote, so both run with a rule on the command line that
# rewrites PUSH_URL to itself: its prefix is the whole URL, the longest a rule can have, so no prefix
# rule (a fetch mirror, or fetching over https while pushes go over ssh) sends them elsewhere. A rule in
# a configuration file for that exact URL ties with it, and git takes the rule whose base (the URL a rule
# rewrites to) it read first, reading the command line last: the file's rule wins, unless a file rule
# with PUSH_URL as its base comes before every rule with the other base, which the command-line rule then
# joins, so git reads PUSH_URL itself. When git would still read the branches of PUSH_URL from another
# URL (the file's rule won the tie, or a remote has that name), nothing is listed, since that URL's
# branches say nothing about what a push to PUSH_URL publishes. Nor is anything listed for a PUSH_URL
# holding '=', which git -c cannot take in that rule's name.
#
# Exit: 0 = listed · 1 = PUSH_URL could not be read, or git reads its branches elsewhere · 2 = usage or git error

set -euo pipefail
# A replace ref (git replace) makes git read another commit in place of one, while git push sends the
# commit itself: the list follows the commits as they are.
export GIT_NO_REPLACE_OBJECTS=1

# The header comment from line 2 to its first non-comment line, so the range cannot drift from it.
usage() { sed -n '1d; /^#/!q; s/^# \{0,1\}//p' "$0"; }
die() { echo "outgoing-commits: $1" >&2; exit 2; }
# A push URL may carry credentials (https://user:token@host/...); it is printed only like this.
mask_url() { printf '%s' "$1" | sed -E 's#://[^/@]*@#://***@#'; }

case "${1:-}" in -h|--help) usage; exit 0 ;; esac
if [ $# -lt 2 ] || [ $# -gt 3 ]; then usage >&2; exit 2; fi
# An argument that starts with - would reach git as an option (ls-remote --upload-pack=..., say).
case "$1" in ''|-*) die "PUSH_URL must be a URL or a path" ;; esac
for rev in "$2" "${3:-HEAD}"; do
    case "$rev" in ''|-*) die "not a commit: $rev" ;; esac
done
url="$1"
base=$(git rev-parse -q --verify "$2^{commit}") || die "not a commit: $2"
tip=$(git rev-parse -q --verify "${3:-HEAD}^{commit}") || die "not a commit: ${3:-HEAD}"
git merge-base --is-ancestor "$base" "$tip" || die "$2 is not an ancestor of ${3:-HEAD}"

# git -c splits its argument at the first =, so the rule below cannot name a URL holding one.
case "$url" in
    *=*) echo "outgoing-commits: PUSH_URL $(mask_url "$url") holds '=', which cannot appear in the url.<base>.insteadOf rule that makes git read the branches of exactly that URL, so the commits a push would publish cannot be listed" >&2
         exit 1 ;;
esac
exact="url.$url.insteadOf=$url"
# The URL git ls-remote and git fetch read for PUSH_URL, after that rule (or a remote of that name).
listed=$(git -c "$exact" ls-remote --get-url -- "$url" 2>/dev/null) || exit 1
if [ "$listed" != "$url" ]; then
    echo "outgoing-commits: git reads the branches of $(mask_url "$url") from $(mask_url "$listed") (a url.<base>.insteadOf rule for that exact URL, or a remote of that name, sends it there), so the commits a push would publish cannot be listed" >&2
    exit 1
fi
heads=$(git -c "$exact" ls-remote --heads "$url" 2>/dev/null) || exit 1
tips=$(printf '%s\n' "$heads" | cut -f1 | grep -E '^[0-9a-f]{40,64}$' || true)
types=""
if [ -n "$tips" ]; then
    types=$(printf '%s\n' "$tips" | git cat-file --batch-check='%(objectname) %(objecttype)') || exit 2
    missing=$(printf '%s\n' "$types" | sed -n 's/ missing$//p')
    if [ -n "$missing" ]; then
        printf '%s\n' "$missing" | git -c core.hooksPath=/dev/null -c "$exact" fetch --quiet --no-tags --no-recurse-submodules --no-write-fetch-head --stdin "$url" >/dev/null 2>&1 || exit 1
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
