#!/usr/bin/env bash
# scan-secrets.sh — stdlib secret scan for the ship runner (KTD7): bash, git, grep, sed and awk only.
#
# Usage: scan-secrets.sh [--range BASE..HEAD] [--commits FILE] [--file PATH]...
#   --range BASE..HEAD   Every line added by every commit in the range (git log -p), so a
#                        key committed and removed again inside the range is still caught;
#                        a merge counts the lines none of its parents has, the committed
#                        text is read whatever .gitattributes says, and so are the messages.
#                        A .env file (or .env.*, except .env.example, .env.sample,
#                        .env.template and .env.dist) added by any commit in the range is a
#                        hit by its name alone, even when a later commit deletes it again.
#   --commits FILE       The same scan over exactly the commits listed in FILE (- for standard
#                        input): one full commit hash per line, oldest first, as
#                        `git rev-list --reverse` prints them. An empty list scans nothing.
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

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }

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

# Every match is tried twice: in the locale, which may read more (a Unicode space for [[:space:]],
# a letter that case-folds to ASCII, such as a long s), and byte by byte (LC_ALL=C), which reads a
# line the locale cannot, such as one with bytes that are not valid UTF-8 (macOS grep skips it). A
# line counts when either matches, so neither reading hides a key the other sees.

# any_match FILE: whether any line of FILE matches either pattern set.
any_match() {
    grep -qaE "$STRICT_ERE" "$1" || grep -qaiE "$LOOSE_ERE" "$1" ||
        LC_ALL=C grep -qaE "$STRICT_ERE" "$1" || LC_ALL=C grep -qaiE "$LOOSE_ERE" "$1"
}

# line_numbers FILE [GREP_OPTION]... PATTERN: the numbers of FILE's matching lines, in both readings;
# exits 2 when grep fails. grep's own status is checked before anything reads its output, so a
# tool that cannot read a matched line is never taken for "no match".
line_numbers() {
    local file="$1" rc
    shift
    rc=0; grep -na "$@" "$file" > "$LINES_TMP.g" || rc=$?
    [ "$rc" -le 1 ] || { echo "scan-secrets: grep failed" >&2; exit 2; }
    rc=0; LC_ALL=C grep -na "$@" "$file" >> "$LINES_TMP.g" || rc=$?
    [ "$rc" -le 1 ] || { echo "scan-secrets: grep failed" >&2; exit 2; }
    LC_ALL=C cut -d: -f1 "$LINES_TMP.g"
}

mask() {   # the line with every matched value replaced by ****, cut to 200 characters
    local out
    if out=$(printf '%s\n' "$1" | sed -E "s#$STRICT_ERE#****#g; s#$LOOSE_ERE#\1=****#Ig" 2>/dev/null | cut -c1-200 2>/dev/null); then
        printf '%s\n' "$out"
        return 0
    fi
    # The locale cannot read the line: mask it byte by byte, every long value-shaped run included.
    printf '%s\n' "$1" | LC_ALL=C sed -E "s#$STRICT_ERE#****#g; s#$LOOSE_ERE#\1=****#Ig; s#[A-Za-z0-9_/+.=-]{20,}#****#g" | LC_ALL=C cut -c1-200
}

HITS=0

scan_file() {
    local path="$1"
    [ -f "$path" ] || { echo "scan-secrets: not a file: $path" >&2; exit 2; }
    # Pre-filter with grep so a large clean file costs one pass.
    if any_match "$path"; then report_hits "$path" file; fi
}

PATCH_TMP="" REVS_TMP="" LINES_TMP=""
trap 'rm -f ${PATCH_TMP:+"$PATCH_TMP"} ${REVS_TMP:+"$REVS_TMP"} ${LINES_TMP:+"$LINES_TMP" "$LINES_TMP.n" "$LINES_TMP.hits" "$LINES_TMP.text" "$LINES_TMP.kinds" "$LINES_TMP.g"}' EXIT

# hit WHERE KIND LINE: count and report one matching line, masked.
hit() {
    HITS=$((HITS + 1))
    echo "$1: $2"
    echo "    $(mask "$3")"
}

# report_hits FILE MODE: every line of FILE that matches, reported through hit() in file order. grep
# finds the matching lines, one pass per pattern set and reading, one awk pass names where each one
# is, and one grep per key shape and reading labels them all, so no process starts per line but the
# mask. Lines are matched with their NUL bytes dropped (bash 4's read dropped them too).
# MODE patch: git log -p output; only the lines a commit adds count. "+++ " names the file only in a
# file's header, between its diff line and its first hunk, so an added "++ ..." line is content. A
# merge's combined diff has one column per parent, and a line counts only when every column is +, so
# a line that a parent already has is left to that parent's commit.
# MODE message: commit messages printed as "commit <hash>" lines followed by the message indented
# one space, so no message line can pose as the header that names the commit.
# MODE file: a plain file, such as the PR body; where is FILE:<line number>.
report_hits() {
    local file="$1" mode="$2" where line kind pat label
    LINES_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    LC_ALL=C tr -d '\000' < "$file" > "$LINES_TMP" || { echo "scan-secrets: tr failed" >&2; exit 2; }
    { line_numbers "$LINES_TMP" -E -e "$STRICT_ERE"; line_numbers "$LINES_TMP" -iE -e "$LOOSE_ERE"; } > "$LINES_TMP.n"
    # Two lines per hit: where, then the line. A quoted path (git -c core.quotePath=false quotes only
    # one with a control character, a double quote or a backslash) is unquoted, with ? for a control
    # character; the tab git puts after an unquoted path with a space in it is dropped.
    LABEL="$file" LC_ALL=C awk -v mode="$mode" -v nums="$LINES_TMP.n" '
        function path(s,   out, i, n, c) {
            if (substr(s, 1, 1) != "\"") { sub(/\t$/, "", s) }
            else {
                out = ""; n = length(s)
                for (i = 2; i <= n; i++) {
                    c = substr(s, i, 1)
                    if (c == "\"") break
                    if (c == "\\") {
                        i++; c = substr(s, i, 1)
                        if (c ~ /[0-7]/) { i += 2; c = "?" }
                        else if (c != "\\" && c != "\"") c = "?"
                    }
                    out = out c
                }
                s = out
            }
            return substr(s, 1, 2) == "b/" ? substr(s, 3) : s
        }
        BEGIN { while ((getline n < nums) > 0) want[n] = 1; close(nums); cols = 1; plus = "+" }
        mode == "file" { if (NR in want) print ENVIRON["LABEL"] ":" NR "\n" $0; next }
        mode == "message" {
            if (substr($0, 1, 7) == "commit ") commit = substr($0, 8, 12)
            else if (substr($0, 1, 1) == " " && (NR in want)) print commit ":commit message" "\n" substr($0, 2)
            next
        }
        substr($0, 1, 7) == "commit " {
            c = substr($0, 8); i = index(c, " "); if (i) c = substr(c, 1, i - 1)
            commit = substr(c, 1, 12); cols = 1; plus = "+"; header = 0; next
        }
        substr($0, 1, 5) == "diff " { header = 1; file = ""; next }
        header && substr($0, 1, 4) == "+++ " { file = path(substr($0, 5)); next }
        substr($0, 1, 2) == "@@" { header = 0; cols = 0; plus = ""; while (substr($0, cols + 2, 1) == "@") { cols++; plus = plus "+" }; next }
        header { next }
        (NR in want) && substr($0, 1, cols) == plus { print commit ":" file "\n" substr($0, cols + 1) }
    ' "$LINES_TMP" > "$LINES_TMP.hits" || { echo "scan-secrets: awk failed" >&2; exit 2; }
    # The kind of each hit, one per line in hit order: the first key shape in STRICT_TABLE that
    # matches it in either reading, or "secret assignment".
    LC_ALL=C sed -n 'n;p' "$LINES_TMP.hits" > "$LINES_TMP.text"
    while IFS="$(printf '\t')" read -r pat label; do
        line_numbers "$LINES_TMP.text" -E -e "$pat" | sed "s/\$/	$label/"
    done > "$LINES_TMP.kinds" <<EOF
$STRICT_TABLE
EOF
    LC_ALL=C awk -F '\t' -v hits="$(wc -l < "$LINES_TMP.text" | tr -d " ")" '
        !($1 in kind) { kind[$1] = $2 }
        END { for (i = 1; i <= hits; i++) print (i in kind) ? kind[i] : "secret assignment" }
    ' "$LINES_TMP.kinds" > "$LINES_TMP.n" || { echo "scan-secrets: awk failed" >&2; exit 2; }
    while IFS= read -r where && IFS= read -r line; do
        IFS= read -r kind <&3 || kind="secret assignment"
        hit "$where" "$kind" "$line"
    done < "$LINES_TMP.hits" 3< "$LINES_TMP.n"
    rm -f "$LINES_TMP" "$LINES_TMP.n" "$LINES_TMP.hits" "$LINES_TMP.text" "$LINES_TMP.kinds" "$LINES_TMP.g"; LINES_TMP=""
}

# is_env_path PATH: a file named .env or .env.*, except the placeholders committed on purpose.
is_env_path() {
    case "${1##*/}" in
        .env.example|.env.sample|.env.template|.env.dist) return 1 ;;
        .env|.env.*) return 0 ;;
    esac
    return 1
}
# is_listed WORD [ITEM]...: WORD equals one of the ITEMs. A path may hold any byte but NUL, so
# paths are compared whole, never through a newline-separated list that a newline would split.
is_listed() {
    local word="$1" item
    shift
    for item in "$@"; do
        if [ "$item" = "$word" ]; then return 0; fi
    done
    return 1
}
# hit_path WHERE: count and report one path that is a secret by its name; nothing of it is read.
# A control character in the path (a newline, say) is printed as ?, so one hit stays on one line.
hit_path() {
    HITS=$((HITS + 1))
    echo "$(printf '%s' "$1" | LC_ALL=C tr '\001-\037\177' '?'): .env file"
}

# scan_range BASE..HEAD: every commit in the range, listed oldest first and scanned as a list is.
scan_range() {
    # A leading - would reach git rev-list as an option.
    case "$1" in [!-]*..*) ;; *) echo "scan-secrets: --range wants BASE..HEAD, got $1" >&2; exit 2 ;; esac
    REVS_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    git rev-list --reverse "$1" > "$REVS_TMP" 2>/dev/null || { echo "scan-secrets: git rev-list failed for $1" >&2; exit 2; }
    scan_commits "$1"
}

# scan_list FILE: exactly the commits FILE lists (- for standard input), read once and checked:
# a line that is not a full commit hash, such as a revision name or an option, is refused.
scan_list() {
    local src="$1" bad
    [ "$src" = - ] && src=/dev/stdin
    [ -r "$src" ] || { echo "scan-secrets: cannot read the commit list: $1" >&2; exit 2; }
    REVS_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    grep -v '^$' "$src" > "$REVS_TMP" || [ $? -eq 1 ] || { echo "scan-secrets: cannot read the commit list: $1" >&2; exit 2; }
    bad=$(grep -Ev '^([0-9a-f]{40}|[0-9a-f]{64})$' "$REVS_TMP" | head -1 || true)
    if [ -n "$bad" ]; then
        echo "scan-secrets: --commits wants one full commit hash per line; not a full commit hash: $(printf '%s' "$bad" | cut -c1-80)" >&2
        exit 2
    fi
    scan_commits "the listed commits"
}

# scan_commits WHAT: the three passes over the commits $REVS_TMP lists, oldest first, which git
# log reads with --stdin --no-walk=unsorted (each listed commit, in its order); WHAT names them in
# an error. git log reads an empty list as HEAD, so an empty list scans nothing.
scan_commits() {
    local what="$1" commit="" line want_path=0 added=0 seen=()
    if [ ! -s "$REVS_TMP" ]; then rm -f "$REVS_TMP"; REVS_TMP=""; return 0; fi
    PATCH_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    # --text: a path marked -diff or binary in .gitattributes still prints its lines, and
    # --no-textconv shows the committed text, never a diff driver's rendering of it.
    # --cc: a merge is diffed against all its parents at once, so the lines it introduces itself
    # (an evil merge, a conflict resolution) are seen, and a line one parent brings in is not
    # reported again: that parent's commit is scanned on its own while it is outgoing.
    # The prefixes are fixed whatever diff.noprefix says, and core.quotePath=false leaves a
    # non-ASCII path unquoted, so report_hits can name every file.
    if ! git -c core.quotePath=false log -p --cc --text --no-textconv --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ \
            --format='commit %H' --no-walk=unsorted --stdin -- . < "$REVS_TMP" > "$PATCH_TMP" 2>/dev/null; then
        echo "scan-secrets: git log failed for $what" >&2
        exit 2
    fi
    if any_match "$PATCH_TMP"; then report_hits "$PATCH_TMP" patch; fi
    # Commit messages are pushed too, and the runner commits the skill's commit-msg.md verbatim.
    # %w(0,1,1) indents every message line by one space and wraps none.
    if ! git log --format='commit %H%n%w(0,1,1)%B' --no-walk=unsorted --stdin < "$REVS_TMP" > "$PATCH_TMP" 2>/dev/null; then
        echo "scan-secrets: git log failed for $what" >&2
        exit 2
    fi
    if any_match "$PATCH_TMP"; then report_hits "$PATCH_TMP" message; fi
    # A .env file is a secret by its name alone, and one a later commit deletes again is still in
    # the pushed history, so the paths added by every commit are listed, oldest first, and each
    # is reported once at the commit that first adds it. --no-renames: a rename to .env counts.
    # -z prints every path unquoted and NUL-terminated, whatever bytes it holds. --name-status
    # puts a status record before each path, so the parse below knows a path by its position
    # and never by its text: a path named like the commit line ("commit secrets/.env") is a path.
    # The record after each commit hash starts with the newline git puts before the file list.
    # --cc gives a merge one status letter per parent after an empty record, and a path counts
    # only when it is added against every parent (AA): one a parent has is that parent's to report.
    if ! git log --no-walk=unsorted --diff-filter=A --name-status --no-renames --cc -z --format=%H --stdin -- . < "$REVS_TMP" > "$PATCH_TMP" 2>/dev/null; then
        echo "scan-secrets: git log failed for $what" >&2
        exit 2
    fi
    commit=""
    # No ".env" bytes means no .env path, so the loop (one read per byte) is skipped; a grep error
    # (exit 2) still runs it.
    if LC_ALL=C grep -qaF .env "$PATCH_TMP" || [ $? -gt 1 ]; then
        while IFS= read -r -d '' line || [ -n "$line" ]; do
            if [ "$want_path" = 1 ]; then
                want_path=0
                if [ "$added" = 1 ] && is_env_path "$line" && ! is_listed "$line" ${seen[@]+"${seen[@]}"}; then
                    seen+=("$line")
                    hit_path "$commit:$line"
                fi
                continue
            fi
            line="${line#$'\n'}"
            case "$line" in
                '') ;;
                *[!ABCDEFGHIJKLMNOPQRSTUVWXYZ]*) commit="${line:0:12}" ;;
                *) want_path=1; case "$line" in *[!A]*) added=0 ;; *) added=1 ;; esac ;;
            esac
        done < "$PATCH_TMP"
    fi
    rm -f "$PATCH_TMP" "$REVS_TMP"; PATCH_TMP="" REVS_TMP=""
}

[ $# -gt 0 ] || { usage; exit 2; }
while [ $# -gt 0 ]; do
    case "$1" in
        --range)   [ $# -ge 2 ] || { usage; exit 2; }; scan_range "$2"; shift 2 ;;
        --range=*) scan_range "${1#--range=}"; shift ;;
        --commits) [ $# -ge 2 ] || { usage; exit 2; }; scan_list "$2"; shift 2 ;;
        --commits=*) scan_list "${1#--commits=}"; shift ;;
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
