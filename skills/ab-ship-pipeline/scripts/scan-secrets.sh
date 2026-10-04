#!/usr/bin/env bash
# scan-secrets.sh — stdlib secret scan for the ship runner (KTD7): bash, git, grep and sed only.
#
# Usage: scan-secrets.sh [--range BASE..HEAD] [--file PATH]...
#   --range BASE..HEAD   Every line added by every commit in the range (git log -p), so a
#                        key committed and removed again inside the range is still caught;
#                        merges are diffed against each parent, paths marked -diff or binary
#                        are read as text, and the commit messages are scanned as well.
#                        A .env file (or .env.*, except .env.example, .env.sample,
#                        .env.template and .env.dist) added by any commit in the range is a
#                        hit by its name alone, even when a later commit deletes it again.
#   --file PATH          Every line of a file, such as the PR body.
#
# Looks for key-shaped strings: cloud access keys, GitHub and GitLab tokens, private key
# blocks, JWTs, Slack, Stripe, Google, OpenAI and Anthropic tokens, and generic
# api_key= / secret= / password= / token= assignments with a long value.
#
# Output on a hit: "<where>:<line>: <kind>" followed by the line with every matched
# value replaced by ****, or "<commit>:<path>: .env file" for a path. No value and no
# file content is ever printed.
# Exit: 0 = clean · 1 = at least one hit · 2 = usage or git error

set -euo pipefail

usage() { sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; }

# Case-sensitive, key-shaped tokens, one per line as PATTERN<tab>LABEL (the \t below become
# tabs). Written so that no literal in this file looks like a key.
STRICT_TABLE=$(printf '%b' '(A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\tcloud access key
gh[pousr]_[A-Za-z0-9]{36,}\tGitHub token
github_pat_[A-Za-z0-9_]{22,}\tGitHub token
glpat-[A-Za-z0-9_-]{20,}\tGitLab token
xox[baprs]-[A-Za-z0-9-]{10,}\tSlack token
sk_live_[0-9A-Za-z]{24,}\tStripe live key
AIza[0-9A-Za-z_-]{35}\tGoogle API key
sk-ant-[A-Za-z0-9_-]{20,}\tAPI key
sk-[A-Za-z0-9]{32,}\tAPI key
eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\tJWT
-----BEGIN[[:space:]]+([A-Z]+[[:space:]]+)*PRIVATE[[:space:]]+KEY-----\tprivate key block')
STRICT_PATTERNS=$(printf '%s\n' "$STRICT_TABLE" | cut -f1)
# Case-insensitive: an assignment of a secret-named variable to a long opaque value.
LOOSE_PATTERNS='(api[_-]?key|apikey|secret[_-]?key|client[_-]?secret|access[_-]?key|private[_-]?key|auth[_-]?token|access[_-]?token|secret|password|passwd|token)[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9_/+.=-]{20,}'

# One alternation per set, for grep and sed.
join_patterns() { printf '%s' "$1" | tr '\n' '|' | sed 's/|$//'; }
STRICT_ERE=$(join_patterns "$STRICT_PATTERNS")
LOOSE_ERE="$LOOSE_PATTERNS"

kind_of() {   # the label of the first pattern that matches the line
    local line="$1" pat label
    while IFS="$(printf '\t')" read -r pat label; do
        if printf '%s\n' "$line" | grep -qE -e "$pat"; then
            echo "$label"
            return 0
        fi
    done <<EOF
$STRICT_TABLE
EOF
    echo "secret assignment"
}

mask() {   # the line with every matched value replaced by ****, cut to 200 characters
    printf '%s\n' "$1" | sed -E "s#$STRICT_ERE#****#g; s#$LOOSE_ERE#\1=****#Ig" | cut -c1-200
}

HITS=0

# scan_text WHERE PATH: every line of PATH that matches, with its 1-based line number.
scan_text() {
    local where="$1" path="$2" n=0 line
    while IFS= read -r line || [ -n "$line" ]; do
        n=$((n + 1))
        if matches "$line"; then hit "$where:$n" "$line"; fi
    done < "$path"
}

scan_file() {
    local path="$1"
    [ -f "$path" ] || { echo "scan-secrets: not a file: $path" >&2; exit 2; }
    # Pre-filter with grep so a large clean file costs one pass.
    if grep -qE "$STRICT_ERE" "$path" || grep -qiE "$LOOSE_ERE" "$path"; then
        scan_text "$path" "$path"
    fi
}

PATCH_TMP=""
trap '[ -n "$PATCH_TMP" ] && rm -f "$PATCH_TMP"' EXIT

# hit WHERE LINE: count and report one matching line, masked.
hit() {
    HITS=$((HITS + 1))
    echo "$1: $(kind_of "$2")"
    echo "    $(mask "$2")"
}
matches() { printf '%s\n' "$1" | grep -qE "$STRICT_ERE" || printf '%s\n' "$1" | grep -qiE "$LOOSE_ERE"; }

# is_env_path PATH: a file named .env or .env.*, except the placeholders committed on purpose.
is_env_path() {
    case "${1##*/}" in
        .env.example|.env.sample|.env.template|.env.dist) return 1 ;;
        .env|.env.*) return 0 ;;
    esac
    return 1
}
# hit_path WHERE: count and report one path that is a secret by its name; nothing of it is read.
hit_path() {
    HITS=$((HITS + 1))
    echo "$1: .env file"
}

scan_range() {
    local range="$1" commit="" file="" line seen=""
    case "$range" in *..*) ;; *) echo "scan-secrets: --range wants BASE..HEAD, got $range" >&2; exit 2 ;; esac
    PATCH_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    # --text: a path marked -diff or binary in .gitattributes still prints its lines.
    # -m: a merge is diffed against each parent, so lines a merge itself introduces are seen.
    if ! git log -p -m --text --no-color --no-ext-diff --format='commit %H' "$range" -- . > "$PATCH_TMP" 2>/dev/null; then
        echo "scan-secrets: git log failed for $range" >&2
        exit 2
    fi
    if grep -qaE "$STRICT_ERE" "$PATCH_TMP" || grep -qaiE "$LOOSE_ERE" "$PATCH_TMP"; then
        while IFS= read -r line || [ -n "$line" ]; do
            case "$line" in
                "commit "*) commit="${line#commit }"; commit="${commit%% *}"; commit="${commit:0:12}"; continue ;;
                "+++ b/"*)  file="${line#+++ b/}"; continue ;;
                "+++ "*|"--- "*|"diff --git "*) continue ;;
                "+"*) ;;
                *) continue ;;
            esac
            line="${line#+}"
            if matches "$line"; then hit "$commit:$file" "$line"; fi
        done < "$PATCH_TMP"
    fi
    # Commit messages are pushed too, and the runner commits the skill's commit-msg.md verbatim.
    if ! git log --format='commit %H%n%B' "$range" > "$PATCH_TMP" 2>/dev/null; then
        echo "scan-secrets: git log failed for $range" >&2
        exit 2
    fi
    if grep -qaE "$STRICT_ERE" "$PATCH_TMP" || grep -qaiE "$LOOSE_ERE" "$PATCH_TMP"; then
        commit=""
        while IFS= read -r line || [ -n "$line" ]; do
            if printf '%s\n' "$line" | grep -qE '^commit [0-9a-f]{40}$'; then commit="${line#commit }"; commit="${commit:0:12}"; continue; fi
            if matches "$line"; then hit "$commit:commit message" "$line"; fi
        done < "$PATCH_TMP"
    fi
    # A .env file is a secret by its name alone, and one a later commit deletes again is still in
    # the pushed history, so the paths added by every commit are listed, oldest first, and each
    # is reported once at the commit that first adds it. --no-renames: a rename to .env counts.
    # core.quotePath=false: a path with a non-ASCII byte is printed as is, not as "caf\303\251/.env"
    # with quotes the basename test would see. Git still quotes a path holding " or \, so those
    # quotes are stripped below; the escapes it leaves inside the path do not reach the basename,
    # which is ASCII for every .env name.
    if ! git -c core.quotePath=false log --reverse --diff-filter=A --name-only --no-renames -m --format='commit %H' "$range" -- . > "$PATCH_TMP" 2>/dev/null; then
        echo "scan-secrets: git log failed for $range" >&2
        exit 2
    fi
    commit=""
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            "commit "*) commit="${line#commit }"; commit="${commit:0:12}"; continue ;;
            "") continue ;;
            \"*) line="${line#\"}"; line="${line%\"}" ;;
        esac
        if is_env_path "$line" && ! printf '%s\n' "$seen" | grep -Fxq -- "$line"; then
            seen="$seen$line"$'\n'
            hit_path "$commit:$line"
        fi
    done < "$PATCH_TMP"
    rm -f "$PATCH_TMP"; PATCH_TMP=""
}

[ $# -gt 0 ] || { usage; exit 2; }
while [ $# -gt 0 ]; do
    case "$1" in
        --range)   [ $# -ge 2 ] || { usage; exit 2; }; scan_range "$2"; shift 2 ;;
        --range=*) scan_range "${1#--range=}"; shift ;;
        --file)    [ $# -ge 2 ] || { usage; exit 2; }; scan_file "$2"; shift 2 ;;
        --file=*)  scan_file "${1#--file=}"; shift ;;
        -h|--help) usage; exit 0 ;;
        *)         echo "scan-secrets: unknown argument: $1" >&2; usage; exit 2 ;;
    esac
done

if [ "$HITS" -gt 0 ]; then
    echo "scan-secrets: $HITS hit(s) (key-shaped values or .env files); nothing is published until they are removed."
    exit 1
fi
exit 0
