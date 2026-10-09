#!/usr/bin/env bash
# check-drift.sh — Exact-match drift gate for count/version claims (R15 / KTD-6).
#
# Ground truth is DERIVED from the filesystem — the number of skills, helper
# prompts (distinct names under skills/*/references/agents/), and hook command
# entries the plugin actually ships, plus the release version — and
# then compared against every hardcoded claim in the manifests and docs. Any
# mismatch prints "LOCATION: expected X, found Y" and the script exits non-zero.
# This replaces manual count sweeps, which drifted three times.
# The site source is checked too: site/src/ and the film and loop compositions in
# site/motion/ carry no literal skill, helper-prompt or hook count (KTD4), and the
# README hero composition's "N skills" sentence matches the tree. Every skill folder
# must sit in exactly one README phase table. It also fails README.md, site/src/ and
# site/motion/ when they bring back adoption or ecosystem wording (the denylist in
# scripts/adoption-denylist.json, shared with scripts/check-site.py).
#
# Usage: check-drift.sh [repo-root]
#   repo-root defaults to the parent of this script's directory, so CI
#   (`bash scripts/check-drift.sh`) and local invocations both resolve correctly.
#
# Deliberately NOT `set -e`: the checker must report every mismatch in a single
# run, so a non-zero check must not abort collection. The embedded python checker
# aggregates all failures and this script propagates its exit code.
#
# Exit codes: 0 = consistent · 1 = drift detected · 2 = ground truth missing/empty
# (a renamed or absent source tree fails loudly here rather than passing vacuously).

set -uo pipefail

# ── Colors (TTY only; CI logs stay plain) ─────────────────────
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
  RED=$(tput setaf 1); GREEN=$(tput setaf 2)
  BLUE=$(tput setaf 4); BOLD=$(tput bold); NC=$(tput sgr0)
else
  RED=""; GREEN=""; BLUE=""; BOLD=""; NC=""
fi

info()    { echo "  ${BLUE}▸${NC} $1"; }
success() { echo "  ${GREEN}✓${NC} $1"; }
fail()    { echo "  ${RED}✗${NC} $1"; }

# ── Resolve repo root ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ $# -ge 1 && -n "${1:-}" ]]; then
  REPO_ROOT="$1"
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
if [[ ! -d "$REPO_ROOT" ]]; then
  fail "repo root not found: $REPO_ROOT"
  exit 2
fi
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"

# The repository root is the plugin root (v4 flattened plugins/<name>/ into it).
PLUGIN_DIR="$REPO_ROOT"
SKILLS_DIR="$PLUGIN_DIR/skills"
# The hook count is the Claude Code file: it carries every handler (the Codex file is a subset).
HOOKS_JSON="$PLUGIN_DIR/hooks/claude-code.json"

echo ""
echo "${BOLD}Drift gate${NC} — $REPO_ROOT"

# ── Ground-truth source existence (fail loud, never vacuous) ──
missing=0
[[ -d "$SKILLS_DIR" ]] || { fail "required directory missing: skills/";        missing=1; }
[[ -f "$HOOKS_JSON"  ]] || { fail "required file missing: hooks/claude-code.json";    missing=1; }
if [[ $missing -ne 0 ]]; then
  fail "ground-truth sources missing under $PLUGIN_DIR — treated as drift, not a pass"
  exit 2
fi

# ── Derive ground truth from the filesystem ───────────────────
SKILLS=$(find "$SKILLS_DIR" -type f -name 'SKILL.md' | wc -l | tr -d ' ')
# Helper prompts: distinct file names, since a shared prompt has byte-identical copies. A companion
# note (<prompt>-<topic>.md beside <prompt>.md, loaded by the prompt at a point of use) is not a prompt.
# The same rule is is_companion() in tests/gates/test_prompt_files.py; change both together.
PROMPTS=$(find "$SKILLS_DIR" -path '*/references/agents/*.md' -type f | while IFS= read -r f; do
    dir=${f%/*}; stem=${f##*/}; stem=${stem%.md}; prefix=$stem; companion=false
    while [ "${prefix%-*}" != "$prefix" ]; do
        prefix=${prefix%-*}
        if [ -f "$dir/$prefix.md" ]; then companion=true; break; fi
    done
    if [ "$companion" = false ]; then printf '%s\n' "${f##*/}"; fi
done | sort -u | wc -l | tr -d ' ')
HOOKS=$(python3 - "$HOOKS_JSON" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as exc:                       # noqa: BLE001 - parse failure -> 0 -> loud fail below
    sys.stderr.write("claude-code.json parse error: %s\n" % exc)
    print(0)
    sys.exit(0)
count = 0
for groups in data.get("hooks", {}).values():  # event -> list of matcher groups
    for group in groups:
        for hook in group.get("hooks", []):
            if hook.get("type") == "command":
                count += 1
print(count)
PY
)

# ── Guard: empty / non-numeric ground truth must fail loudly ──
for pair in "skills:$SKILLS" "prompts:$PROMPTS" "hooks:$HOOKS"; do
  name="${pair%%:*}"; val="${pair##*:}"
  if ! [[ "$val" =~ ^[0-9]+$ ]] || [[ "$val" -eq 0 ]]; then
    fail "derived $name count is '$val' (zero or non-numeric) — refusing to pass vacuously"
    exit 2
  fi
done

info "Derived ground truth: ${BOLD}${SKILLS}${NC} skills · ${BOLD}${HOOKS}${NC} hooks · ${BOLD}${PROMPTS}${NC} helper prompts"
echo ""

# ── Compare every hardcoded claim against ground truth ────────
# The checker anchors each claim narrowly so frozen changelog text (README
# "What's New" entries) is never gated — only current-state claims. A missing
# anchor is reported as drift, not skipped.
python3 - "$REPO_ROOT" "$SKILLS" "$PROMPTS" "$HOOKS" "$SCRIPT_DIR/adoption-denylist.json" <<'PY'
import json, os, re, sys

repo = sys.argv[1]
SK, PR, HK = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
DENYLIST = sys.argv[5]
GT = {"skills": SK, "hooks": HK}   # current-state count claims; agents are no longer counted

failures = []
_cache = {}

def rd(rel):
    """Read a repo-relative file (cached). A missing canonical location is drift."""
    if rel in _cache:
        return _cache[rel]
    try:
        with open(os.path.join(repo, rel), encoding="utf-8") as fh:
            _cache[rel] = fh.read()
    except OSError as exc:
        failures.append("%s: cannot read (%s) — expected count/version claim location to exist"
                        % (rel, exc.strerror))
        _cache[rel] = None
    return _cache[rel]

def json_get(rel, path):
    text = rd(rel)
    if text is None:
        return None
    try:
        cur = json.loads(text)
    except json.JSONDecodeError as exc:
        failures.append("%s: invalid JSON (%s) — cannot verify counts/version" % (rel, exc))
        return None
    try:
        for key in path:
            cur = cur[key]
    except (KeyError, IndexError, TypeError):
        failures.append("%s: missing field '%s' — manifest shape changed, re-point the gate"
                        % (rel, ".".join(map(str, path))))
        return None
    return cur

# Single-line "N skills ... N hooks" (separator-agnostic, never crosses a digit or newline,
# so a leftover "N skills, N agents, N hooks" claim does not match and is reported).
TRIPLE   = re.compile(r"(\d+) skills[^\d\n]+?(\d+) hooks")
LABELED  = re.compile(r"[├└]──\s*(\d+)\s+(skills|hooks)\b")  # README tree
# v4 moved agents into skills as helper prompts; no current-state surface may still count them.
AGENT_COUNT = re.compile(r"\b\d+\+?\s+(?:specialized\s+)?(?:sub)?agents\b|[├└]──\s*\d+\s+agents\b", re.IGNORECASE)

def no_agent_count(label, rel, text):
    if text is None:
        return
    m = AGENT_COUNT.search(text)
    if m:
        failures.append("%s (%s): still claims an agent count (%r); v4 has helper prompts, not agents"
                        % (label, rel, m.group(0)))

def check_triple(label, rel, text, min_matches=1, pattern=TRIPLE):
    if text is None:
        return
    matches = list(pattern.finditer(text))
    if len(matches) < min_matches:
        failures.append("%s (%s): expected >=%d 'N skills ... N hooks' claim(s), found %d "
                        "— anchor text changed, re-point the gate"
                        % (label, rel, min_matches, len(matches)))
        return
    for m in matches:
        got = [int(m.group(1)), int(m.group(2))]
        if got != [SK, HK]:
            failures.append("%s (%s): expected %d skills / %d hooks, found %d / %d"
                            % (label, rel, SK, HK, got[0], got[1]))
    no_agent_count(label, rel, text)

def check_single(label, rel, text, pattern, name):
    if text is None:
        return
    m = re.search(pattern, text)
    if not m:
        failures.append("%s (%s): '%s' count claim not found (/%s/) — anchor text changed, re-point the gate"
                        % (label, rel, name, pattern))
        return
    got = int(m.group(1))
    if got != GT[name]:
        failures.append("%s (%s): expected %d %s, found %d" % (label, rel, GT[name], name, got))

# ── COUNT CLAIMS (current-state locations only) ──
plugin_json = ".claude-plugin/plugin.json"
marketplace = ".claude-plugin/marketplace.json"

check_triple("plugin.json description", plugin_json, json_get(plugin_json, ["description"]))
check_triple("marketplace.json plugin description", marketplace,
             json_get(marketplace, ["plugins", 0, "description"]))
# install.sh derives its version and skill count from the tree at run time, so it carries no claim to check.

readme = rd("README.md")
if readme is not None:
    # README Helper Prompts Reference table must enumerate every helper prompt — the old
    # agents table sat at 26 rows for three releases while 29 agents shipped.
    am = re.search(r'\| Helper \| Domain \| When it runs \|\n\|[-| ]*\n((?:\|[^\n]*\n)+)', readme)
    if not am:
        failures.append("README.md Helper Prompts Reference table: header not found — anchor changed, "
                        "re-point the gate")
    else:
        arows = len(am.group(1).strip().splitlines())
        if arows != PR:
            failures.append("README.md Helper Prompts Reference table: %d rows, skills ship %d helper prompts"
                            % (arows, PR))

# site/motion/readme-hero/composition.html — source of the README's hero.gif and the site's
# readme-hero video (site/motion/RENDER.md). Both bake the skill count in ("N skills that take
# a coding agent ..."), so every count in the source must match the tree.
hero_rel = "site/motion/readme-hero/composition.html"
hero = rd(hero_rel)
if hero is not None:
    hero_counts = re.findall(r"\b(\d+) skills\b", hero)
    if not hero_counts:
        failures.append("%s: no 'N skills' claim found — anchor text changed, re-point the gate" % hero_rel)
    for num in hero_counts:
        if int(num) != SK:
            failures.append("%s: claims %s skills, the tree ships %d — fix it, then re-render the README "
                            "hero as site/motion/RENDER.md says" % (hero_rel, num, SK))
    no_agent_count("README hero composition", hero_rel, hero)

# Site source (KTD4): site/src/ and the film and loop compositions in site/motion/ state no
# literal skill, helper-prompt or hook count. Pages render counts from site data; the film and
# the loops state none, so a new skill never forces a re-render. The README hero is checked
# above instead. Generated HyperFrames projects (.work/) are git-ignored and skipped.
def site_files():
    """(repo-relative path, text) of every text file under site/src/ and site/motion/."""
    for top in ("site/src", "site/motion"):
        base = os.path.join(repo, top)
        if not os.path.isdir(base):
            failures.append("%s/: not found — the site source moved, re-point the gate" % top)
            continue
        for root, dirs, files in os.walk(base):
            dirs[:] = sorted(d for d in dirs if d not in (".work", "node_modules"))
            for name in sorted(files):
                path = os.path.join(root, name)
                try:
                    with open(path, encoding="utf-8") as fh:
                        text = fh.read()
                except (UnicodeDecodeError, OSError):
                    continue                     # fonts and other binary assets
                yield os.path.relpath(path, repo).replace(os.sep, "/"), text

SITE_FILES = list(site_files())
LITERAL_COUNT = re.compile(r"(?<![\w.])\d+\+?(?:\s|&nbsp;|&#160;)+(?:skills|helper[ -]prompts|helpers|hooks|"
                           r"hook handlers)\b", re.IGNORECASE)
for rel, text in SITE_FILES:
    if rel.startswith("site/motion/readme-hero/"):
        continue
    for m in LITERAL_COUNT.finditer(text):
        failures.append("%s:%d: literal count '%s'; render counts from site data (KTD4), and keep them out of "
                        "the film and the loops"
                        % (rel, text.count("\n", 0, m.start()) + 1, " ".join(m.group(0).split())))

# README phase tables: every skill folder sits in exactly one row of the "## Skills reference"
# tables. The site's catalog and skill pages are built from those tables, so a folder missing from
# them (or listed twice) breaks the site build; this says so without Node.
readme = rd("README.md")
if readme is not None:
    ref = re.search(r"^## Skills reference\n(.*?)(?=^## |\Z)", readme, re.MULTILINE | re.DOTALL)
    rows = {}
    phase = None
    for line in (ref.group(1) if ref else "").splitlines():
        if line.startswith("### "):
            phase = line[4:].strip()
        else:
            row = re.match(r"\|\s*\[([^\]]+)\]\(skills/[^)]*\)\s*\|", line)
            if row and phase:
                rows.setdefault(row.group(1), []).append(phase)
    if not rows:
        failures.append("README.md Skills reference: no phase-table rows found — anchor changed, re-point the gate")
    else:
        folders = sorted(d for d in os.listdir(os.path.join(repo, "skills"))
                         if os.path.isfile(os.path.join(repo, "skills", d, "SKILL.md")))
        for name in folders:
            phases = rows.get(name, [])
            if not phases:
                failures.append("README.md Skills reference: skill folder %s is in no phase table" % name)
            elif len(phases) > 1:
                failures.append("README.md Skills reference: skill folder %s has %d rows (%s); expected one"
                                % (name, len(phases), ", ".join(phases)))

claude_md = rd("AGENTS.md")  # canonical; CLAUDE.md is a symlink to it
check_single("AGENTS.md layout", "AGENTS.md", claude_md, r"(\d+) skills, each a folder", "skills")
no_agent_count("AGENTS.md", "AGENTS.md", claude_md)

readme = rd("README.md")
if readme is not None:
    tree = list(LABELED.finditer(readme))
    if re.search(r"[├└]──\s*\d+\s+agents\b", readme):
        failures.append("README.md project-structure tree: still lists an agent count; v4 has helper prompts")
    if len(tree) < 2:
        failures.append("README.md project-structure tree (README.md): expected >=2 tree count lines, "
                        "found %d — anchor changed, re-point the gate" % len(tree))
    for m in tree:
        num, name = int(m.group(1)), m.group(2)
        if num != GT[name]:
            failures.append("README.md project-structure tree (README.md) '%s': expected %d, found %d"
                            % (name, GT[name], num))

# ── VERSION EQUALITY (canonical = plugin.json .version) ──
version = json_get(plugin_json, ["version"])
if version is None:
    failures.append("plugin.json version: missing — cannot establish the canonical release version")
else:
    # marketplace.json is unversioned today; verify only if a version field is added later.
    mtext = rd(marketplace)
    if mtext:
        try:
            mdata = json.loads(mtext)
            candidates = [("marketplace.json version", mdata.get("version")),
                          ("marketplace.json plugins[0].version",
                           (mdata.get("plugins") or [{}])[0].get("version"))]
            for loc, val in candidates:
                if val is not None and val != version:
                    failures.append("%s: expected %s, found %s" % (loc, version, val))
        except (json.JSONDecodeError, IndexError, AttributeError, TypeError):
            pass  # count check already reported any shape problem

# README navigation anchor: the nav's "What's New" link must point at the slug of
# the FIRST "## What's new in v…" heading (the v3.2.1 sweep found this exact
# anchor stuck on an old version). Slug rule mirrors GitHub's: lowercase; drop
# every character that is not a letter, digit, space, or hyphen; spaces become
# hyphens (so "v3.5.2 — X" -> "v352--x", the double hyphen is kept). Only the
# first heading is gated; any later one is history.
def gh_slug(heading):
    kept = "".join(c for c in heading.strip().lower() if c.isalnum() or c in " -")
    return kept.replace(" ", "-")

readme = rd("README.md")
if readme is not None:
    hm = re.search(r"^#{2,3} (What's new in v[^\n]*)$", readme, re.MULTILINE | re.IGNORECASE)
    nm = re.search(r'href="(#whats-new[^"]*)"', readme)
    if not hm:
        failures.append("README.md: first '## What's new in v…' heading not found "
                        "— anchor changed, re-point the gate")
    if not nm:
        failures.append("README.md nav: href=\"#whats-new…\" What's-New link not found "
                        "— anchor changed, re-point the gate")
    if hm and nm:
        expected = "#" + gh_slug(hm.group(1))
        if nm.group(1) != expected:
            failures.append("README nav What's-New anchor: expected %s, found %s"
                            % (expected, nm.group(1)))

# ── PUBLIC-SURFACE WORDING (README.md, site/src/, site/motion/) ──
# No adoption or ecosystem claims on the public surfaces: the README and the site say what
# the blueprint does, not where its ideas came from. The phrases and project names in
# scripts/adoption-denylist.json belonged to the removed comparison and import sections; any of
# them coming back fails. scripts/check-site.py reads the same file for the built site.
# A space in a phrase matches any run of whitespace (line breaks included), &nbsp;, inline
# tags and Markdown emphasis, so a soft wrap, <em>imported</em> from or what&nbsp;we took
# still fails. A lone _ counts as a word edge (Markdown emphasis); a class like x__y does not.
# The whole file is searched; a hit is reported at the line where it starts, once per line.
try:
    with open(DENYLIST, encoding="utf-8") as fh:
        denylist = json.load(fh)
    ADOPTION = re.compile(r"(?<![a-z0-9])(?<!\w_)(?:%s)(?![a-z0-9])(?!_\w)"
                          % "|".join(p.replace(" ", denylist["gap"]) for p in denylist["phrases"]), re.IGNORECASE)
except (OSError, ValueError, KeyError, TypeError) as exc:
    failures.append("scripts/adoption-denylist.json: cannot read the denylist (%s)" % exc)
    ADOPTION = None
surfaces = [("README.md", rd("README.md"))] + SITE_FILES if ADOPTION else []
for rel, text in surfaces:
    if text is None:
        continue
    reported = set()
    for hit in ADOPTION.finditer(text):
        lineno = text.count("\n", 0, hit.start()) + 1
        if lineno not in reported:
            reported.add(lineno)
            failures.append("%s:%d: adoption or ecosystem claim '%s'; the public docs describe the blueprint itself"
                            % (rel, lineno, " ".join(hit.group(0).split())))

# ── Report ──
if failures:
    print("DRIFT DETECTED — %d mismatch(es):" % len(failures))
    print("")
    for f in failures:
        print("  " + f)
    print("")
    print("Ground truth (derived from filesystem): %d skills, %d hooks, %d helper prompts; version %s"
          % (SK, HK, PR, version))
    sys.exit(1)

print("OK — every count and version claim matches ground truth: "
      "%d skills, %d hooks, %d helper prompts; version %s" % (SK, HK, PR, version))
sys.exit(0)
PY
CHECKER_RC=$?

echo ""
if [[ "$CHECKER_RC" -eq 0 ]]; then
  success "No drift — all count and version claims are consistent."
else
  fail "Drift detected (see mismatches above). Fix each LOCATION to match ground truth."
fi
exit "$CHECKER_RC"
