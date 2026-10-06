#!/usr/bin/env bash
# scan-secrets.sh — stdlib secret scan for the ship runner (KTD7): bash, git, grep, sed and awk only.
#
# Usage: scan-secrets.sh [--range BASE..HEAD] [--commits FILE] [--file PATH]...
#   --range BASE..HEAD   Every line added by every commit in the range (git log -p), so a
#                        key committed and removed again inside the range is still caught;
#                        a merge counts the lines none of its parents has, except in a file
#                        git shows there only as binary: that file is read against each
#                        parent, so a line a parent brought in is reported again there, and
#                        a line the merge adds is reported once per parent. The committed
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
# file content is ever printed. The closing "N hit(s)" counts every report, a line
# reported once per parent included.
# Exit: 0 = clean · 1 = at least one hit · 2 = usage or git error

set -euo pipefail
# A replace ref (git replace) would show every git command here a stand-in for a commit, while git
# push sends the commit itself, so they all read the objects as they are.
export GIT_NO_REPLACE_OBJECTS=1

# The header comment from line 2 to its first non-comment line, so the range cannot drift from it.
usage() { sed -n -- '1d; /^#/!q; s/^# \{0,1\}//p' "$0"; }
die() { echo "scan-secrets: $1" >&2; exit 2; }

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
# The kind of a hit that no key shape in STRICT_TABLE matches.
OTHER_KIND="secret assignment"

# One alternation per set, for grep and sed.
join_patterns() { printf '%s' "$1" | tr '\n' '|' | sed 's/|$//'; }
STRICT_ERE=$(join_patterns "$STRICT_PATTERNS")
LOOSE_ERE="$LOOSE_PATTERNS"
# The sed program that masks a line: every value either set matches becomes ****.
MASK_SED="s#$STRICT_ERE#****#g; s#$LOOSE_ERE#\1=****#Ig"

# Every match is tried twice: in the locale, which may read more (a Unicode space for [[:space:]],
# a letter that case-folds to ASCII, such as a long s), and byte by byte (LC_ALL=C), which reads a
# line the locale cannot, such as one with bytes that are not valid UTF-8 (macOS grep skips it). A
# line counts when either matches, so neither reading hides a key the other sees, and its values
# are masked in both readings alike (in tr_TR, I does not fold to i, so only C reads API_KEY=).

# Every file name reaches grep, sed, cut and awk after --, so a name that starts with - (--file -x.txt)
# is read as a file, never taken for an option.

# matches GREP_ARGUMENT...: whether grep -q finds a match; exits 2 when grep fails, so a file grep
# cannot read is never taken for one without a match.
matches() {
    local rc=0
    grep -q "$@" || rc=$?
    [ "$rc" -le 1 ] || die "grep failed"
    return "$rc"
}

# any_match FILE: whether any line of FILE matches either pattern set.
any_match() {
    matches -aE -- "$STRICT_ERE" "$1" || matches -aiE -- "$LOOSE_ERE" "$1" ||
        LC_ALL=C matches -aE -- "$STRICT_ERE" "$1" || LC_ALL=C matches -aiE -- "$LOOSE_ERE" "$1"
}

# line_numbers FILE [GREP_OPTION]... PATTERN: the numbers of FILE's matching lines, in both readings;
# exits 2 when grep fails. grep's own status is checked before anything reads its output, so a
# tool that cannot read a matched line is never taken for "no match".
line_numbers() {
    local file="$1" rc
    shift
    rc=0; grep -na "$@" -- "$file" > "$LINES_TMP/grep" || rc=$?
    [ "$rc" -le 1 ] || die "grep failed"
    rc=0; LC_ALL=C grep -na "$@" -- "$file" >> "$LINES_TMP/grep" || rc=$?
    [ "$rc" -le 1 ] || die "grep failed"
    LC_ALL=C cut -d: -f1 -- "$LINES_TMP/grep"
}

mask() {   # the line with every matched value replaced by ****, cut to 200 characters
    local out
    if out=$(printf '%s\n' "$1" | sed -E "$MASK_SED" 2>/dev/null | LC_ALL=C sed -E "$MASK_SED" | cut -c1-200 2>/dev/null); then
        printf '%s\n' "$out"
        return 0
    fi
    # The locale cannot read the line: mask it byte by byte, every long value-shaped run included.
    printf '%s\n' "$1" | LC_ALL=C sed -E "$MASK_SED; s#[A-Za-z0-9_/+.=-]{20,}#****#g" | LC_ALL=C cut -c1-200
}

HITS=0

# nonul: standard input without its NUL bytes. Every text is scanned that way, by the pre-filter and
# the report alike: awk on macOS ends a record at its first NUL and would read less of a line than
# grep matched, and UTF-16 text (a NUL after every ASCII byte) matches only without them.
nonul() { LC_ALL=C tr -d '\000'; }

scan_file() {
    local path="$1"
    [ -f "$path" ] || die "not a file: $path"
    PATCH_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    nonul < "$path" > "$PATCH_TMP" || die "cannot read $path"
    # Pre-filter with grep so a large clean file costs one pass.
    if any_match "$PATCH_TMP"; then report_hits "$PATCH_TMP" file "$path"; fi
    rm -f "$PATCH_TMP"; PATCH_TMP=""
}

PATCH_TMP="" REVS_TMP="" LINES_TMP="" BINARY_TMP=""
trap 'rm -rf ${PATCH_TMP:+"$PATCH_TMP"} ${REVS_TMP:+"$REVS_TMP"} ${LINES_TMP:+"$LINES_TMP"} ${BINARY_TMP:+"$BINARY_TMP"}' EXIT

# hit WHERE KIND MASKED: count and report one matching line, already masked.
hit() {
    HITS=$((HITS + 1))
    echo "$1: $2"
    echo "    $3"
}

# printable NAME: NAME with ? for each control character (a newline, say), so it fits on one line.
printable() { printf '%s' "$1" | LC_ALL=C tr '\001-\037\177' '?'; }

# The awk function path(TEXT, PREFIX): the file a diff header line names after its "+++ " or
# "diff --cc ", with PREFIX dropped. A quoted path (git -c core.quotePath=false quotes only one with
# a control character, a double quote or a backslash) is unquoted, with ? for a control character;
# the tab git puts after a path with a space in it is dropped. path() labels a hit, and two names
# can label alike (a<newline>b and a?b), so a file is matched by printed(TEXT, PREFIX) instead: the
# path as git printed it, quotes and escapes kept, with PREFIX and that tab dropped.
PATH_AWK='
    function path(s, prefix,   out, i, n, c) {
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
        return substr(s, 1, length(prefix)) == prefix ? substr(s, length(prefix) + 1) : s
    }
    function printed(s, prefix,   q) {
        sub(/\t$/, "", s); q = (substr(s, 1, 1) == "\"")
        return substr(s, q + 1, length(prefix)) == prefix ? substr(s, 1, q) substr(s, q + length(prefix) + 1) : s
    }'

# report_hits FILE MODE [NAME]: every line of FILE, a text already through nonul, that matches,
# reported through hit() in file order. grep finds the matching lines, one pass per pattern set and
# reading, one awk pass names where each one is, one grep per key shape and reading labels them all,
# and one sed pass per reading masks them, so no process starts per line unless the locale cannot
# read one.
# MODE patch: git log -p output; only the lines a commit adds count. "+++ " names the file only in a
# file's header, between its diff line and its first hunk, so an added "++ ..." line is content. A
# merge's combined diff has one column per parent, and a line counts only when every column is +, so
# a line that a parent already has is left to that parent's commit. With NAME, a file of
# "<commit hash><tab><path as printed() gives it>" lines, only the files it lists count.
# MODE message: commit messages printed as "commit <hash>" lines followed by the message indented
# one space, so no message line can pose as the header that names the commit.
# MODE file: the text of the file NAME, such as the PR body; where is NAME:<line number>, with NAME
# printable.
report_hits() {
    local file="$1" mode="$2" name="${3:-}" only="" where line kind masked pat label
    if [ "$mode" = patch ]; then only="$name"; fi
    LINES_TMP=$(mktemp -d "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    { line_numbers "$file" -E -e "$STRICT_ERE"; line_numbers "$file" -iE -e "$LOOSE_ERE"; } > "$LINES_TMP/numbers"
    # Two lines per hit: where, then the line, so a file's name is made printable first.
    LABEL=$(printable "$name") LC_ALL=C awk -v mode="$mode" -v nums="$LINES_TMP/numbers" -v only="$only" -- "$PATH_AWK"'
        BEGIN {
            while ((getline n < nums) > 0) want[n] = 1; close(nums); cols = 1; plus = "+"
            if (only != "") { while ((getline n < only) > 0) keep[n] = 1; close(only) }
        }
        mode == "file" { if (NR in want) print ENVIRON["LABEL"] ":" NR "\n" $0; next }
        mode == "message" {
            if (substr($0, 1, 7) == "commit ") commit = substr($0, 8, 12)
            else if (substr($0, 1, 1) == " " && (NR in want)) print commit ":commit message" "\n" substr($0, 2)
            next
        }
        substr($0, 1, 7) == "commit " {
            c = substr($0, 8); i = index(c, " "); if (i) c = substr(c, 1, i - 1)
            full = c; commit = substr(c, 1, 12); cols = 1; plus = "+"; header = 0; next
        }
        substr($0, 1, 5) == "diff " { header = 1; file = ""; id = ""; next }
        header && substr($0, 1, 4) == "+++ " { file = path(substr($0, 5), "b/"); id = printed(substr($0, 5), "b/"); next }
        substr($0, 1, 2) == "@@" { header = 0; cols = 0; plus = ""; while (substr($0, cols + 2, 1) == "@") { cols++; plus = plus "+" }; next }
        header { next }
        (NR in want) && substr($0, 1, cols) == plus && (only == "" || ((full "\t" id) in keep)) { print commit ":" file "\n" substr($0, cols + 1) }
    ' "$file" > "$LINES_TMP/hits" || die "awk failed"
    # The kind of each hit, one per line in hit order: the first key shape in STRICT_TABLE that
    # matches it in either reading, or OTHER_KIND.
    LC_ALL=C sed -n -- 'n;p' "$LINES_TMP/hits" > "$LINES_TMP/text"
    while IFS="$(printf '\t')" read -r pat label; do
        line_numbers "$LINES_TMP/text" -E -e "$pat" | sed "s/\$/	$label/"
    done > "$LINES_TMP/kinds" <<EOF
$STRICT_TABLE
EOF
    LC_ALL=C awk -F '\t' -v hits="$(wc -l < "$LINES_TMP/text" | tr -d " ")" -v other="$OTHER_KIND" -- '
        !($1 in kind) { kind[$1] = $2 }
        END { for (i = 1; i <= hits; i++) print (i in kind) ? kind[i] : other }
    ' "$LINES_TMP/kinds" > "$LINES_TMP/labels" || die "awk failed"
    # Each hit masked, one per line in hit order, in one pass per reading, as mask() masks. When the
    # locale cannot read a line (macOS sed and cut fail on bytes that are not valid UTF-8), every
    # line goes through mask() on its own instead, so each is masked exactly as mask() masks it.
    if ! sed -E -- "$MASK_SED" "$LINES_TMP/text" 2>/dev/null | LC_ALL=C sed -E -- "$MASK_SED" | cut -c1-200 > "$LINES_TMP/masked" 2>/dev/null; then
        while IFS= LC_ALL=C read -r line; do printf '%s\n' "$(mask "$line")"; done < "$LINES_TMP/text" > "$LINES_TMP/masked"
    fi
    # The records are read byte by byte (LC_ALL=C): bash 5 in a UTF-8 locale takes a byte that starts
    # a character, with the newline after it, as one character, which pairs every later hit with the
    # wrong line.
    while IFS= LC_ALL=C read -r where && IFS= LC_ALL=C read -r line; do
        IFS= LC_ALL=C read -r kind <&3 || kind="$OTHER_KIND"
        IFS= LC_ALL=C read -r masked <&4 || masked=""
        hit "$where" "$kind" "$masked"
    done < "$LINES_TMP/hits" 3< "$LINES_TMP/labels" 4< "$LINES_TMP/masked"
    rm -rf "$LINES_TMP"; LINES_TMP=""
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
# The path is printed printable, so one hit stays on one line.
hit_path() {
    HITS=$((HITS + 1))
    echo "$(printable "$1"): .env file"
}

# scan_range BASE..HEAD: every commit in the range, listed oldest first and scanned as a list is.
scan_range() {
    # A leading - would reach git rev-list as an option.
    case "$1" in [!-]*..*) ;; *) die "--range wants BASE..HEAD, got $1" ;; esac
    REVS_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    git rev-list --reverse "$1" > "$REVS_TMP" 2>/dev/null || die "git rev-list failed for $1"
    scan_commits "$1"
}

# scan_list FILE: exactly the commits FILE lists (- for standard input), read once and checked:
# a line that is not a full commit hash, such as a revision name or an option, is refused.
scan_list() {
    local src="$1" bad
    [ "$src" = - ] && src=/dev/stdin
    [ -r "$src" ] || die "cannot read the commit list: $1"
    REVS_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    grep -v -- '^$' "$src" > "$REVS_TMP" || [ $? -eq 1 ] || die "cannot read the commit list: $1"
    bad=$(grep -Ev -- '^([0-9a-f]{40}|[0-9a-f]{64})$' "$REVS_TMP" | head -1 || true)
    [ -z "$bad" ] || die "--commits wants one full commit hash per line; not a full commit hash: $(printf '%s' "$bad" | cut -c1-80)"
    scan_commits "the listed commits"
}

# scan_binary_files WHAT: --cc prints only "Binary files differ" for a file it takes for binary
# (marked -diff or binary in .gitattributes, or holding a NUL byte), whatever --text says, so the
# lines a merge adds to one are read again. One awk pass lists each merge and file the patch in
# $PATCH_TMP shows that way, and git log reads those merges against each parent in turn (-m, which
# honours --text; log.diffMerges, which -m follows, is pinned to separate). Only the listed files
# count there, each known by its path as git printed it; a line a parent brings in is reported
# again, and a line the merge adds is reported once per parent, which errs on the safe side.
scan_binary_files() {
    BINARY_TMP=$(mktemp -d "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    LC_ALL=C awk -- "$PATH_AWK"'
        substr($0, 1, 7) == "commit " { c = substr($0, 8); i = index(c, " "); if (i) c = substr(c, 1, i - 1); header = 0; next }
        substr($0, 1, 10) == "diff --cc " { file = printed(substr($0, 11), ""); header = 1; next }
        substr($0, 1, 5) == "diff " || substr($0, 1, 2) == "@@" { header = 0; next }
        header && substr($0, 1, 13) == "Binary files " { print c "\t" file; header = 0 }
    ' "$PATCH_TMP" > "$BINARY_TMP/files" || die "awk failed"
    # git log would read an empty list as HEAD.
    if [ -s "$BINARY_TMP/files" ]; then
        LC_ALL=C cut -f1 -- "$BINARY_TMP/files" | uniq > "$BINARY_TMP/merges" || die "cut failed"
        git -C "$TOP" -c core.quotePath=false -c log.diffMerges=separate log -p -m --text --no-textconv --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ \
            --format='commit %H' --no-walk=unsorted --stdin -- . < "$BINARY_TMP/merges" 2>/dev/null | nonul > "$BINARY_TMP/patch" || die "git log failed for $1"
        if any_match "$BINARY_TMP/patch"; then report_hits "$BINARY_TMP/patch" patch "$BINARY_TMP/files"; fi
    fi
    rm -rf "$BINARY_TMP"; BINARY_TMP=""
}

# scan_commits WHAT: the three passes over the commits $REVS_TMP lists, oldest first, which git
# log reads with --stdin --no-walk=unsorted (each listed commit, in its order); WHAT names them in
# an error. git log reads an empty list as HEAD, so an empty list scans nothing.
scan_commits() {
    local what="$1" commit="" line status="" seen=()
    if [ ! -s "$REVS_TMP" ]; then rm -f "$REVS_TMP"; REVS_TMP=""; return 0; fi
    # Every pass that lists paths runs at the top of the work tree (git -C "$TOP"): its -- . and
    # diff.relative both count from the working directory, so a scan started in a subdirectory
    # would read only that subtree. --show-cdup prints nothing at the top and in a bare repository,
    # and git -C with an empty path stays where it is.
    TOP=$(git rev-parse --show-cdup 2>/dev/null) || die "git rev-parse failed for $what"
    PATCH_TMP=$(mktemp "${TMPDIR:-/tmp}/scan-secrets.XXXXXX")
    # --text: a path marked -diff or binary in .gitattributes still prints its lines (except in a
    # merge, which scan_binary_files reads again), and --no-textconv shows the committed text,
    # never a diff driver's rendering of it.
    # --cc: a merge is diffed against all its parents at once, so the lines it introduces itself
    # (an evil merge, a conflict resolution) are seen, and a line one parent brings in is not
    # reported again (except in a file --cc shows only as binary, which scan_binary_files reads
    # against each parent): that parent's commit is scanned on its own while it is outgoing.
    # The prefixes are fixed whatever diff.noprefix says, and core.quotePath=false leaves a
    # non-ASCII path unquoted, so report_hits can name every file. --root: a root commit shows its
    # lines whatever log.showRoot says.
    git -C "$TOP" -c core.quotePath=false log -p --cc --root --text --no-textconv --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ \
        --format='commit %H' --no-walk=unsorted --stdin -- . < "$REVS_TMP" 2>/dev/null | nonul > "$PATCH_TMP" || die "git log failed for $what"
    if any_match "$PATCH_TMP"; then report_hits "$PATCH_TMP" patch; fi
    # "Binary files" starts no line of a diff --text prints, so only --cc can have printed one.
    if LC_ALL=C matches -a -- '^Binary files ' "$PATCH_TMP"; then scan_binary_files "$what"; fi
    # Commit messages are pushed too, and the runner commits the skill's commit-msg.md verbatim.
    # %w(0,1,1) indents every message line by one space and wraps none.
    git log --format='commit %H%n%w(0,1,1)%B' --no-walk=unsorted --stdin < "$REVS_TMP" 2>/dev/null | nonul > "$PATCH_TMP" ||
        die "git log failed for $what"
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
    # --root, as in the patch pass: a root commit lists the paths it adds.
    git -C "$TOP" log --no-walk=unsorted --root --diff-filter=A --name-status --no-renames --cc -z --format=%H --stdin -- . < "$REVS_TMP" > "$PATCH_TMP" 2>/dev/null ||
        die "git log failed for $what"
    commit=""
    # No ".env" bytes means no .env path, so the loop (one read per byte) is skipped; a grep error
    # (exit 2) still runs it. The records are read byte by byte, as report_hits reads its own, so a
    # path that ends in a byte that starts a character does not swallow the NUL after it.
    if LC_ALL=C grep -qaF -- .env "$PATCH_TMP" || [ $? -gt 1 ]; then
        while IFS= LC_ALL=C read -r -d '' line || [ -n "$line" ]; do
            # The record after a status is its path; the path counts only when the status is all A.
            if [ -n "$status" ]; then
                case "$status" in
                    *[!A]*) ;;
                    *) if is_env_path "$line" && ! is_listed "$line" ${seen[@]+"${seen[@]}"}; then
                           seen+=("$line")
                           hit_path "$commit:$line"
                       fi ;;
                esac
                status=""
                continue
            fi
            line="${line#$'\n'}"
            case "$line" in
                '') ;;
                *[!ABCDEFGHIJKLMNOPQRSTUVWXYZ]*) commit="${line:0:12}" ;;
                *) status="$line" ;;
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
