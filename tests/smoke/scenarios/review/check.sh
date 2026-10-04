#!/usr/bin/env bash
# review check: the review reports the seeded eval of --filter in cli.py as a finding. Naming eval
# and cli.py is not enough ("No findings: eval in cli.py is safe" names both): one block of the
# output must name eval, cli.py or --filter and call it a security problem or rate it P0/P1 or
# critical. A block is a paragraph, a list item with its sub-items, a table row, or a finding in a
# reviewer's JSON artifact, read with the headings above it. A block that calls the code fine, or
# sits under a Discarded, Filtered, Declined or No-issues heading, does not count.
# The output is the final message plus any file the skill wrote under .agent-blueprint/review-runs/
# or docs/ since the base commit.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1" BASE="$2" FINAL="$3"
cd "$WORK"
LIST=$(mktemp "${TMPDIR:-/tmp}/ab-smoke-review.XXXXXX")
trap 'rm -f "$LIST"' EXIT
if [ -f "$FINAL" ]; then printf '%s\n' "$FINAL" > "$LIST"; fi
if [ -d .agent-blueprint/review-runs ]; then
    find .agent-blueprint/review-runs -type f >> "$LIST" 2>/dev/null || true
fi
# An if, not `[ -f ] && ...`: a deleted file listed last would end the loop non-zero and set -e
# would stop the check without a reason.
{ git diff --name-only "$BASE" -- docs; git ls-files --others --exclude-standard -- docs; } | while IFS= read -r f; do
    if [ -f "$f" ]; then printf '%s\n' "$f" >> "$LIST"; fi
done
python3 - "$LIST" <<'PY'
import json, re, sys

files = [p for p in open(sys.argv[1], encoding="utf-8").read().splitlines() if p]
texts = []
for p in files:
    try:
        texts.append((p, open(p, encoding="utf-8", errors="replace").read()))
    except OSError:
        pass
everything = "\n".join(t for _, t in texts)

missing = []
if not re.search(r"(^|[^A-Za-z0-9_])eval([^A-Za-z0-9_]|$)", everything, re.M):
    missing.append("eval")
if "cli.py" not in everything:
    missing.append("cli.py")
if missing:
    print("the review output does not name: " + ", ".join(missing))
    sys.exit(1)

I = re.I
SUBJECT = re.compile(r"(^|[^A-Za-z0-9_])eval([^A-Za-z0-9_]|$)|cli\.py|--filter", I | re.M)
SECURITY = re.compile(r"\b(arbitrary|security|insecure|unsafe|dangerous|untrusted|malicious|rce)\b"
                      r"|\binject(ion|ed|s)?\b|\bvulnerab\w*|\bexploit\w*|\battacker\w*"
                      r"|\b(code|command|shell) execution\b", I)
SEVERITY = re.compile(r"\b(p0|p1|critical|blocker)\b|\b(severity|priority)\W{0,3}(high|critical)\b"
                      r"|\bhigh[- ](severity|priority|risk)\b", I)
ZERO_BEFORE = re.compile(r"\b(0|no|zero)\s+$", I)              # "0 P1", "no critical"
ZERO_AFTER = re.compile(r"^\W*(\w+\W+)?(0|none)\b", I)         # "P1 Critical: 0", "Critical: none"
CLEAN = re.compile(r"\bno (findings|issues|problems|concerns|vulnerabilities)\b"
                   r"|\bno (security|blocking|actionable|real|critical|major|high|p0|p1)( or \w+)?"
                   r" (findings|issues|problems|concerns|risks?|impact|vulnerabilities)\b"
                   r"|\b(is|are|looks|seems) (safe|fine|harmless|acceptable)\b"
                   r"|\bnot (a|an) (real |actual |security )?(issue|problem|concern|vulnerability|finding|bug)\b"
                   r"|\bnot (classified|considered|treated|rated|flagged) as\b"
                   r"|\bnothing to (report|flag|fix)\b|\blgtm\b|\b(discarded|dismissed) (as|because)\b", I)
# Section headings for findings that were set aside ("Discarded (false positives)", "Filtered (below
# confidence gate)", "No Issues Found In", "Declined, and the ruling"), matched at a heading's start
# or by the gate's wording, so a title such as "Filtered listing runs arbitrary code" still counts.
SET_ASIDE = re.compile(r"^\W*(discarded|dismissed|declined|false positives?|no issues|no findings)\b"
                       r"|false positive|confidence gate|below (the )?confidence", I)
ITEM = re.compile(r"^(\s*)([-*+]|\d+[.)])\s")


def blocks(text):
    """([headings above], block text) for each paragraph, list item with its sub-items, or table row."""
    out, cur, item_indent, heads = [], [], None, []

    def flush():
        nonlocal cur, item_indent
        if cur:
            out.append(([h for _, h in heads], "\n".join(cur)))
        cur, item_indent = [], None

    for line in text.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*)", line)
        if m:
            flush()
            level = len(m.group(1))
            heads = [h for h in heads if h[0] < level] + [(level, m.group(2))]
            continue
        if not line.strip():
            flush()
            continue
        if line.lstrip().startswith("|"):
            flush()
            out.append(([h for _, h in heads], line))
            continue
        item = ITEM.match(line)
        # A list item at or left of the block's own list marker starts the next finding; deeper
        # items, and list lines under a plain paragraph (a bold title line), belong to this one.
        if item and cur and item_indent is not None and len(item.group(1)) <= item_indent:
            flush()
        if not cur:
            item_indent = len(item.group(1)) if item else None
        cur.append(line)
    flush()
    return out


def json_findings(node):
    """The finding objects (a title and a severity) anywhere in a reviewer's JSON artifact."""
    if isinstance(node, dict):
        if "severity" in node and "title" in node:
            yield node
        else:
            for v in node.values():
                yield from json_findings(v)
    elif isinstance(node, list):
        for v in node:
            yield from json_findings(v)


def rating(text):
    """The first severity label in text that is not a zero count, or None."""
    for m in SEVERITY.finditer(text):
        if not ZERO_BEFORE.search(text[max(0, m.start() - 6):m.start()]) and not ZERO_AFTER.match(text[m.end():m.end() + 20]):
            return m.group(0)
    return None


def strings(node):
    if isinstance(node, dict):
        return " ".join(strings(v) for v in node.values())
    if isinstance(node, list):
        return " ".join(strings(v) for v in node)
    return str(node)


candidates = []   # ([headings], block)
for path, text in texts:
    if path.endswith(".json"):
        try:
            data = json.loads(text)
        except ValueError:
            data = None
        if data is not None:
            candidates.extend(([], strings(f)) for f in json_findings(data))
            continue
    candidates.extend(blocks(text))

findings = [(" / ".join(h), b) for h, b in candidates
            if SUBJECT.search(b) and not (any(SET_ASIDE.search(x) or CLEAN.search(x) for x in h) or CLEAN.search(b))]
# A security term is the stronger evidence, so every block is searched for one before a rating.
for heads, block in findings:
    why = SECURITY.search(block)
    if why:
        print("the review reports eval in cli.py as a finding (security: %s)" % why.group(0).lower())
        sys.exit(0)
for heads, block in findings:
    rated = rating(block) or rating(heads)
    if rated:
        print("the review reports eval in cli.py as a finding (rated %s)" % rated.lower())
        sys.exit(0)

print("the review names eval and cli.py but reports no finding on them: no block calls eval, cli.py or "
      "--filter a security problem or rates it P0/P1/critical (a clean verdict does not count)")
sys.exit(1)
PY
