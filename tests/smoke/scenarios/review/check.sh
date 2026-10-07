#!/usr/bin/env bash
# review check: the review reports the seeded eval of --filter in cli.py as a finding. Naming eval
# and cli.py is not enough ("No findings: eval in cli.py is safe" names both): one block of the
# output must name eval, cli.py or --filter and call it a security problem or rate it P0/P1 or
# critical. A block is a paragraph, a list item with its sub-items or a table row, read with the
# headings above it. A security word or rating that its clause denies ("isn't a security issue",
# "low security impact", "not a P1") is not evidence. A block that calls the code fine counts only
# when it is rated, in the block or in its section heading; one under a Discarded, Filtered,
# Declined or No-issues heading, or that says it was discarded, rejected or fell below the
# confidence gate, never counts.
# The output is the final message plus any file the skill wrote under docs/ since the base commit.
# When the output's verdict is clean ("No findings.", "No issues found.", a Findings heading over
# "None."), only a block that rates the eval itself counts, so a scope line naming them does not.
# The per-reviewer artifacts under .agent-blueprint/review-runs/ are raw proposals the validator
# and the synthesis may still drop, so they count only when the output defers to them: it names
# neither the subject nor a verdict and points to the run folder. Even then a JSON finding under
# a discarded, rejected or filtered key, marked rejected, or below its severity's confidence gate
# (P1 50, P2 65, P3 75) does not count.
# Arguments: WORK BASE FINAL LOG REMOTE. Prints the reason; exit 0 = pass, 1 = fail.
set -euo pipefail
WORK="$1" BASE="$2" FINAL="$3"
cd "$WORK"
LIST=$(mktemp "${TMPDIR:-/tmp}/ab-smoke-review.XXXXXX")
trap 'rm -f "$LIST"' EXIT
# One line per source: its kind (final, report or raw), a tab, its path.
if [ -f "$FINAL" ]; then printf 'final\t%s\n' "$FINAL" > "$LIST"; fi
# An if, not `[ -f ] && ...`: a deleted file listed last would end the loop non-zero and set -e
# would stop the check without a reason.
{ git diff --name-only "$BASE" -- docs; git ls-files --others --exclude-standard -- docs; } | while IFS= read -r f; do
    if [ -f "$f" ]; then printf 'report\t%s\n' "$f" >> "$LIST"; fi
done
if [ -d .agent-blueprint/review-runs ]; then
    find .agent-blueprint/review-runs -type f 2>/dev/null | while IFS= read -r f; do printf 'raw\t%s\n' "$f"; done >> "$LIST" || true
fi
python3 - "$LIST" <<'PY'
import json, re, sys

sources = []   # (kind, path, text); a JSON file is a reviewer's artifact wherever it sits
for line in open(sys.argv[1], encoding="utf-8").read().splitlines():
    kind, _, path = line.partition("\t")
    if not path:
        continue
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError:
        continue
    sources.append(("raw" if path.endswith(".json") else kind, path, text))

EVAL = r"(^|[^A-Za-z0-9_])eval([^A-Za-z0-9_]|$)"   # an ASCII word edge, the same with and without re.I
SUBJECT = re.compile(EVAL + r"|cli\.py|--filter", re.I | re.M)
# "security" names a defect, not a topic: "security review" or "the security-sentinel lens" is scope.
SECURITY = re.compile(r"\b(arbitrary|insecure|unsafe|dangerous|untrusted|malicious|rce)\b"
                      r"|\bsecurity\b(?![- ](review|reviewer|reviewers|reviewed|sentinel|audit|assessment|lens|scan|check|pass|perspective)\b)"
                      r"|\binject(ion|ed|s)?\b|\bvulnerab\w*|\bexploit\w*|\battacker\w*"
                      r"|\b(code|command|shell) execution\b", re.I)
SEVERITY = re.compile(r"\b(p0|p1|critical|blocker)\b|\b(severity|priority)\W{0,3}(high|critical)\b"
                      r"|\bhigh[- ](severity|priority|risk)\b", re.I)
ZERO_BEFORE = re.compile(r"\b(0|no|zero)\s+$", re.I)              # "0 P1", "no critical"
ZERO_AFTER = re.compile(r"^\W*(\w+\W+)?(0|none)\b", re.I)         # "P1 Critical: 0", "Critical: none"
ZERO_START = re.compile(r"^\W*(none|nothing|no|n/a)\b", re.I)     # "None." under a "### Critical" heading
# A denial in the term's own clause: a negator or minimiser, then only words that keep the denial
# on the term ("isn't a security issue", "doesn't pose a security risk", "low security impact", "not
# classified as an exploitable injection vulnerability"). "With no sandbox, eval runs arbitrary
# code" and "is not validated, so arbitrary code runs" keep their evidence.
SEP = r"[\s*_`\"“”-]+"
NEG = r"(?:\b(?:no|not(?!\s+(?:only|just|merely)\b)|never|none|nothing|nor|neither|without|cannot|hardly|barely|low|minimal|negligible|little|limited)\b|n['’]t\b)"
FILLER = (r"(?:a|an|the|any|real|actual|actually|really|much|very|serious|significant|meaningful|genuine|true|practical|"
          r"realistic|direct|immediate|obvious|big|major|known|exploitable|remote|code|command|shell|pose|poses|posed|posing|"
          r"present|presents|represent|represents|constitute|constitutes|create|creates|introduce|introduces|raise|raises|"
          r"amount|amounts|make|makes|made|it|this|that|these|here|there|to|be|been|being|as|count|counts|seem|seems|appear|"
          r"appears|look|looks|like|considered|classified|treated|rated|flagged|reported|deemed|of|for|from|is|are|was|were|"
          r"risk|risks|evidence|sign|signs|indication|path|way|danger|chance|possibility|concern|threat|arbitrary|security|"
          r"insecure|unsafe|dangerous|untrusted|malicious|injection|execution|vulnerability|vulnerable)")
DENIED_BEFORE = re.compile(NEG + r"(?:" + SEP + FILLER + r"\b){0,6}" + SEP + r"$", re.I)
# After the term, in its clause: "the security risk of eval in cli.py is low", "an attacker cannot
# reach it"; in its sentence: "Security impact: none".
DENIED_AFTER = re.compile(r"^.{0,40}?\b(?:is|are|was|were|seems?|looks?|appears?|remains?)" + SEP
                          + r"(?:(?:very|quite|fairly|rather|pretty|relatively|extremely)" + SEP + r")?"
                          r"(?:low|minimal|negligible|limited|theoretical|unlikely|nil|none|moot)\b"
                          r"|^\s+(?:can(?:not|['’]t)|could(?:n['’]t|\s+not)|won['’]t|never)\b", re.I)
DENIED_COLON = re.compile(r"^[\s*_`-]*(?:\w+[\s*_`-]+){0,2}?\w*[*_`]*:\s*[*_`]*(?:none|low|minimal|negligible|n/a)\b", re.I)
CLAUSE_END = re.compile(r"\.(?=\s|$)|[;:!?,()\[\]\n—–]|\s-\s|\b(?:but|so|because|since|which|while|although|though|yet|whereas|however)\b", re.I)
SENTENCE_END = re.compile(r"\.(?=\s|$)|[;!?\n]")
CLEAN = re.compile(r"\bno (findings|issues|problems|concerns|vulnerabilities)\b"
                   r"|\bno (security|blocking|actionable|real|critical|major|high|p0|p1)( or \w+)?"
                   r" (findings|issues|problems|concerns|risks?|impact|vulnerabilities)\b"
                   r"|\b(is|are|looks|seems) (safe|fine|harmless|acceptable)\b"
                   r"|(\bnot|n['’]t) (a|an) (real |actual |security |practical )?(issue|problem|concern|vulnerability|finding|bug|risk|threat)\b"
                   r"|(\bnot|n['’]t) (pose|present|represent|constitute|introduce|create) (a|an|any) (real |actual |security |practical |meaningful )?"
                   r"(risk|threat|issue|problem|concern|vulnerability)\b"
                   r"|\bnot (classified|considered|treated|rated|flagged) as\b"
                   r"|\bnothing to (report|flag|fix)\b|\blgtm\b", re.I)
# Section headings for findings that were set aside ("Discarded (false positives)", "Filtered (below
# confidence gate)", "No Issues Found In", "Declined, and the ruling"), matched at a heading's start
# or by the gate's wording, so a title such as "Filtered listing runs arbitrary code" still counts.
SET_ASIDE = re.compile(r"^\W*(discarded|dismissed|declined|false positives?|no issues|no findings)\b"
                       r"|false positive|confidence gate|below (the )?confidence", re.I)
# The same inside a block: a finding that says it was set aside, whatever it is rated.
SET_ASIDE_BLOCK = re.compile(r"\b(discarded|dismissed) (as|because)\b|\b(rejected|refuted) (as (a )?false|by the (validator|synthesi[sz]er|synthesis))"
                             r"|\bbelow (the |its )?(confidence )?gate\b", re.I)
# A clean verdict: a whole heading, or a block's first sentence, that says the review found nothing.
VERDICT = re.compile(r"^(?:(?:verdict|result|outcome|findings?|issues?|status|review)\s*[:—–-]\s*)?"
                     r"(?:(?:no|zero|0)\s+(?:(?:security|actionable|real)\s+)?(?:findings?|issues?|problems?|concerns?|vulnerabilit(?:y|ies)|defects?|bugs?)"
                     r"(?:\s+(?:were\s+|was\s+)?(?:found|identified|detected|reported|raised|survived(?:\s+\w+){0,3}))?"
                     r"(?:\s+(?:in|on|for)\s+(?:this|the)\s+(?:change|diff|branch|commit|range|review|pr))?"
                     r"|nothing\s+(?:to\s+(?:report|flag|fix)|found)|lgtm|looks\s+good(?:\s+to\s+me)?"
                     r"|total\s+findings\s*:\s*0\b.*|(?:p[0-3](?:\s+\w+)?\s*:\s*0\b[\s|,;]*)+)$", re.I)
NONE = re.compile(r"^(?:none|n/a|nothing)(?:\s+found)?$", re.I)                # under a Findings heading
FINDINGS_HEAD = re.compile(r"^\W*(?:findings?|issues?|verdict|results?)\W*$", re.I)
HANDOFF = re.compile(r"review-runs|\brun (folder|directory)\b|\bartifacts?\b", re.I)
ITEM = re.compile(r"^(\s*)([-*+]|\d+[.)])\s")
# The swarm's per-severity confidence gates (findings-synthesizer Step 2.5).
GATES = {"p0": 50, "p1": 50, "critical": 50, "high": 50, "p2": 65, "important": 65, "medium": 65,
         "p3": 75, "suggestion": 75, "low": 75, "minor": 75}
SET_ASIDE_KEY = re.compile(r"discard|reject|filter|dismiss|declin|false.?positive|suppress|below|refut", re.I)


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


def plain(text):
    """text without list markers, emphasis and the closing full stop, for the verdict patterns."""
    text = re.sub(r"[*_`>]", "", ITEM.sub("", text.strip(), count=1)).strip()
    return re.sub(r"[.!\s]+$", "", text)


def clean_verdict(text):
    """True when a heading, or a block's first sentence, says the review found nothing."""
    for heads, block in blocks(text):
        first = plain(re.split(r"(?<=[.!?;])\s|\n", block.strip(), maxsplit=1)[0])
        if VERDICT.match(first) or (NONE.match(first) and heads and FINDINGS_HEAD.match(heads[-1])):
            return True
    return any(VERDICT.match(plain(m.group(1))) for m in re.finditer(r"^#{1,6}\s+(.*)", text, re.M))


def denied(text, start, end):
    """True when the clause around text[start:end] denies or minimises it."""
    before = text[max(0, start - 160):start]
    cut = 0
    for m in CLAUSE_END.finditer(before):
        cut = m.end()
    sentence = text[end:end + 120]
    stop = SENTENCE_END.search(sentence)
    sentence = sentence[:stop.start()] if stop else sentence
    stop = CLAUSE_END.search(sentence)
    clause = sentence[:stop.start()] if stop else sentence
    return bool(DENIED_BEFORE.search(" " + before[cut:]) or DENIED_AFTER.match(clause) or DENIED_COLON.match(sentence))


def security(text):
    """The first security term in text that its clause does not deny, or None."""
    for m in SECURITY.finditer(text):
        if not denied(text, m.start(), m.end()):
            return m.group(0)
    return None


def rating(text):
    """The first severity label in text that is not a zero count or denied, or None."""
    for m in SEVERITY.finditer(text):
        if ZERO_BEFORE.search(text[max(0, m.start() - 6):m.start()]) or ZERO_AFTER.match(text[m.end():m.end() + 20]):
            continue
        if not denied(text, m.start(), m.end()):
            return m.group(0)
    return None


def set_aside(obj):
    """True for a JSON finding the validator or the synthesis set aside, or below its confidence gate."""
    for key in ("validation_status", "status", "verdict", "disposition", "outcome", "resolution"):
        if isinstance(obj.get(key), str) and SET_ASIDE_KEY.search(obj[key]):
            return True
    if obj.get("validated") is False or any(obj.get(k) is True for k in ("discarded", "rejected", "filtered", "dismissed")):
        return True
    conf, gate = obj.get("confidence"), GATES.get(str(obj.get("severity", "")).strip().lower())
    if isinstance(conf, (int, float)) and not isinstance(conf, bool) and gate is not None:
        return (conf * 100 if 0 < conf <= 1 and isinstance(conf, float) else conf) < gate
    return False


def json_findings(node):
    """The finding objects (a title and a severity) in a reviewer's JSON artifact that still stand."""
    if isinstance(node, dict):
        if "severity" in node and "title" in node:
            if not set_aside(node):
                yield node
        else:
            for k, v in node.items():
                if not SET_ASIDE_KEY.search(str(k)):
                    yield from json_findings(v)
    elif isinstance(node, list):
        for v in node:
            yield from json_findings(v)


def strings(node):
    if isinstance(node, dict):
        return " ".join(strings(v) for v in node.values())
    if isinstance(node, list):
        return " ".join(strings(v) for v in node)
    return str(node)


delivered = [s for s in sources if s[0] != "raw"]
delivered_text = "\n".join(t for _, _, t in delivered)
clean = any(clean_verdict(t) for _, _, t in delivered)
judged = delivered
raw = [s for s in sources if s[0] == "raw"]
if raw and not clean and not SUBJECT.search(delivered_text) and HANDOFF.search(delivered_text):
    judged = delivered + raw
    clean = any(clean_verdict(t) for _, p, t in raw if not p.endswith(".json"))
everything = "\n".join(t for _, _, t in judged)

missing = []
if not re.search(EVAL, everything, re.M):
    missing.append("eval")
if "cli.py" not in everything:
    missing.append("cli.py")
if missing:
    print("the review output does not name: " + ", ".join(missing))
    sys.exit(1)

candidates = []   # ([headings], block, from a JSON artifact)
for kind, path, text in judged:
    if path.endswith(".json"):
        try:
            data = json.loads(text)
        except ValueError:
            data = None
        if data is not None:
            candidates.extend(([], strings(f), True) for f in json_findings(data))
            continue
    candidates.extend((h, b, False) for h, b in blocks(text))


def evidence(heads, block, from_json):
    """("security", term) or ("rated", label) when the block reports the eval in cli.py, else None."""
    if not SUBJECT.search(block) or SET_ASIDE_BLOCK.search(block) or any(SET_ASIDE.search(x) or CLEAN.search(x) for x in heads):
        return None
    own, hedged = rating(block), CLEAN.search(block)
    if clean:
        # The output's verdict is clean: a scope line or an artifact does not outvote it, a block
        # that rates the eval itself does.
        return ("rated", own) if own and not hedged and not from_json else None
    rated = own or (None if ZERO_START.match(block) else rating(" / ".join(heads)))
    if hedged and not rated:
        return None   # "eval in cli.py is fine" is a verdict; beside a rating it is a hedge
    why = security(block)
    if why:
        return ("security", why)
    return ("rated", rated) if rated else None


found = [e for e in (evidence(*c) for c in candidates) if e]
# A security term is the stronger evidence, so every block is searched for one before a rating.
for kind, label in ("security", "security: %s"), ("rated", "rated %s"):
    for k, why in found:
        if k == kind:
            print("the review reports eval in cli.py as a finding (%s)" % (label % why.lower()))
            sys.exit(0)

print("the review names eval and cli.py but reports no finding on them: no block calls eval, cli.py or "
      "--filter a security problem or rates it P0/P1/critical (a clean verdict does not count)")
sys.exit(1)
PY
