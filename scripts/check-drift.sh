#!/usr/bin/env bash
# check-drift.sh — Exact-match drift gate for count/version claims (R15 / KTD-6).
#
# Ground truth is DERIVED from the filesystem — the number of skills, helper
# prompts (distinct names under skills/*/references/agents/), and hook command
# entries the plugin actually ships, plus the release version — and
# then compared against every hardcoded claim in the manifests, docs, installer,
# and website. Any mismatch prints "LOCATION: expected X, found Y" and the script
# exits non-zero. This replaces manual count sweeps, which drifted three times.
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
HOOKS_JSON="$PLUGIN_DIR/hooks/hooks.json"

echo ""
echo "${BOLD}Drift gate${NC} — $REPO_ROOT"

# ── Ground-truth source existence (fail loud, never vacuous) ──
missing=0
[[ -d "$SKILLS_DIR" ]] || { fail "required directory missing: skills/";        missing=1; }
[[ -f "$HOOKS_JSON"  ]] || { fail "required file missing: hooks/hooks.json";    missing=1; }
if [[ $missing -ne 0 ]]; then
  fail "ground-truth sources missing under $PLUGIN_DIR — treated as drift, not a pass"
  exit 2
fi

# ── Derive ground truth from the filesystem ───────────────────
SKILLS=$(find "$SKILLS_DIR" -type f -name 'SKILL.md' | wc -l | tr -d ' ')
# Helper prompts: distinct file names, since a shared prompt has byte-identical copies.
PROMPTS=$(find "$SKILLS_DIR" -path '*/references/agents/*.md' -type f | sed 's#.*/##' | sort -u | wc -l | tr -d ' ')
HOOKS=$(python3 - "$HOOKS_JSON" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as exc:                       # noqa: BLE001 - parse failure -> 0 -> loud fail below
    sys.stderr.write("hooks.json parse error: %s\n" % exc)
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
# "What's New" entries, older index.html new__badge spans) is never gated —
# only current-state claims. A missing anchor is reported as drift, not skipped.
python3 - "$REPO_ROOT" "$SKILLS" "$PROMPTS" "$HOOKS" <<'PY'
import json, os, re, sys

repo = sys.argv[1]
SK, PR, HK = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
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
PROVIDES = re.compile(r"Plugin provides:\s*(\d+) skills[^\d\n]+?(\d+) hooks")
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
_idx = rd("index.html")
check_triple("index.html meta/og description", "index.html",
             _idx.split('id="whats-new"')[0] if _idx is not None else None, min_matches=2)

# index.html current-state count WIDGETS (hero stats, "By The Numbers" bar, feature
# cards, "All N Skills" heading). Restricted to everything BEFORE the #whats-new
# changelog section so frozen historical counts (e.g. an old "53 skills, zero
# commands") are never gated. Covers both widget shapes: inline ("55 Skills") and
# span-separated ('...__number">55</span> ... >Skills<'). The span form guards against
# pairing a number with a distant label by refusing to cross another __number.
idx_html = rd("index.html")
if idx_html is not None:
    prefix = idx_html.split('id="whats-new"')[0]
    label_gt = {"skills": SK, "hooks": HK}
    widgets = 0
    for m in re.finditer(r"(\d+)(?:\s|&nbsp;|&#160;)+(Skills|Agents|Hooks)\b", prefix):
        widgets += 1
        num, lab = int(m.group(1)), m.group(2).lower()
        if lab == "agents":
            failures.append("index.html widget (inline '%d Agents'): v4 has no agent count; remove the widget" % num)
        elif num != label_gt[lab]:
            failures.append("index.html widget (inline '%d %s'): expected %d — homepage count drifted"
                            % (num, m.group(2), label_gt[lab]))
    for m in re.finditer(r'__number">(\d+)K?\+?</span>(?:(?!__number">).)*?<(?:h3|span[^>]*)>(Skills|Agents|Hooks)<',
                         prefix, re.DOTALL):
        widgets += 1
        num, lab = int(m.group(1)), m.group(2).lower()
        if lab == "agents":
            failures.append("index.html widget (badge '%d Agents'): v4 has no agent count; remove the widget" % num)
        elif num != label_gt[lab]:
            failures.append("index.html widget (badge '%d %s'): expected %d — homepage count drifted"
                            % (num, m.group(2), label_gt[lab]))
    if widgets < 4:
        failures.append("index.html: expected >=4 Skills/Hooks count widgets before #whats-new, "
                        "found %d — anchor changed, re-point the gate" % widgets)

check_triple("install.sh 'Plugin provides' summary", "install.sh", rd("install.sh"),
             min_matches=2, pattern=PROVIDES)

# index.html structural grids (before #whats-new): every skill and helper prompt must
# be rendered — v3.4.0 added skills/agents that never reached the site grids — and
# each group/category count badge must equal the items it actually renders.
if idx_html is not None:
    tag_count = len(re.findall(r'class="skill-tag"', prefix))
    if tag_count != SK:
        failures.append("index.html skills grid: renders %d skill-tag entries, expected %d "
                        "— grid is missing skills" % (tag_count, SK))
    name_count = len(re.findall(r'agent-item__name"', prefix))
    if name_count != PR:
        failures.append("index.html helper-prompt grid: renders %d entries, expected %d helper prompts"
                        % (name_count, PR))
    no_agent_count("index.html current-state sections", "index.html", prefix)
    for kind, item_pat in (("agent-group", r'agent-item__name"'),
                           ("skill-category", r'class="skill-tag"')):
        parts = re.split(r'%s__count">(\d+)</span>' % kind, prefix)
        for k in range(1, len(parts) - 1, 2):
            declared, got = int(parts[k]), len(re.findall(item_pat, parts[k + 1]))
            if got != declared:
                failures.append("index.html %s #%d: count badge says %d but %d items render under it"
                                % (kind, (k + 1) // 2, declared, got))

# Ecosystem repo count: the README table is ground truth; intro prose, the site
# widget, and site prose must match it exactly (the "15+"/"16+" fossils understated
# a growing table).
readme = rd("README.md")
if readme is not None:
    m = re.search(r'\| Repo / Tool \| Stars \|[^\n]*\n\|[-| ]*\n((?:\|[^\n]*\n)+)', readme)
    if not m:
        failures.append("README.md ecosystem table: 'Repo / Tool | Stars' header not found "
                        "— anchor changed, re-point the gate")
    else:
        repos = len(m.group(1).strip().splitlines())
        claims = []
        rm = re.search(r'analyzed \*\*(\d+) repos', readme)
        if rm:
            claims.append(("README.md intro 'analyzed **N repos'", int(rm.group(1))))
        else:
            failures.append("README.md: 'analyzed **N repos' intro claim not found "
                            "— anchor changed, re-point the gate")
        if idx_html is not None:
            for wm in re.finditer(r'__number">(\d+)\+?</span>(?:(?!__number">).)*?>Repos Analyzed<',
                                  prefix, re.DOTALL):
                claims.append(("index.html 'Repos Analyzed' widget", int(wm.group(1))))
            for pm2 in re.finditer(r'(\d+)\+? repos analyzed', prefix):
                claims.append(("index.html 'repos analyzed' prose", int(pm2.group(1))))
        if len(claims) < 3:
            failures.append("ecosystem repo-count: expected >=3 claims (README intro + site widget "
                            "+ site prose), found %d — anchor changed, re-point the gate" % len(claims))
        for label, val in claims:
            if val != repos:
                failures.append("%s: claims %d repos, ecosystem table has %d rows" % (label, val, repos))
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

# docs/images/promo-video.html — source of the baked overview.gif (regenerated via
# scripts/record-promo.js). Gating the source keeps the shipped GIF honest: scene 2
# stat cards must match ground truth and use only current-state categories (the old
# GIF shipped a defunct "27 Commands" card for months), and scene 6's install
# terminal carries a TRIPLE claim.
promo_rel = "docs/images/promo-video.html"
promo = rd(promo_rel)
check_triple("promo-video.html install terminal", promo_rel, promo)
if promo is not None:
    cards = re.findall(r'stat-number">(\d+)</div>\s*<div class="stat-label-txt">(\w+)<', promo)
    if len(cards) < 2:
        failures.append("%s: expected >=2 scene-2 stat cards, found %d — anchor changed, "
                        "re-point the gate" % (promo_rel, len(cards)))
    for num, lab in cards:
        key = lab.lower()
        if key not in GT:
            failures.append("%s stat card '%s': not a current-state category — remove or "
                            "rename the card (promo GIF must be re-rendered after)" % (promo_rel, lab))
        elif int(num) != GT[key]:
            failures.append("%s stat card '%s': expected %d, found %s — promo GIF source drifted"
                            % (promo_rel, lab, GT[key], num))

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
    install = rd("install.sh")
    if install is not None:
        m = re.search(r'^VERSION="([^"]+)"', install, re.MULTILINE)
        if not m:
            failures.append('install.sh: VERSION="..." line not found — anchor changed, re-point the gate')
        elif m.group(1) != version:
            failures.append("install.sh VERSION: expected %s (matches plugin.json), found %s"
                            % (version, m.group(1)))

    index = rd("index.html")
    if index is not None:
        hero = re.search(r'class="hero__badge">.*?v(\d+\.\d+\.\d+)', index, re.DOTALL)
        if not hero:
            failures.append("index.html hero badge: version not found — anchor changed, re-point the gate")
        elif hero.group(1) != version:
            failures.append("index.html hero badge version: expected %s, found %s" % (version, hero.group(1)))

        anchor = index.find('id="whats-new"')
        if anchor == -1:
            failures.append("index.html: #whats-new section not found — anchor changed, re-point the gate")
        else:
            latest = re.search(r'new__badge">v(\d+\.\d+\.\d+)', index[anchor:])
            if not latest:
                failures.append("index.html What's-New latest badge: version not found — anchor changed")
            elif latest.group(1) != version:
                failures.append("index.html What's-New latest badge version: expected %s, found %s"
                                % (version, latest.group(1)))

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
# the FIRST "### What's New in v…" heading (the v3.2.1 sweep found this exact
# anchor stuck on an old version). Slug rule mirrors GitHub's: lowercase; drop
# every character that is not a letter, digit, space, or hyphen; spaces become
# hyphens (so "v3.5.2 — X" -> "v352--x", the double hyphen is kept). Older
# What's-New headings are frozen history and stay ungated.
def gh_slug(heading):
    kept = "".join(c for c in heading.strip().lower() if c.isalnum() or c in " -")
    return kept.replace(" ", "-")

readme = rd("README.md")
if readme is not None:
    hm = re.search(r"^### (What's New in v[^\n]*)$", readme, re.MULTILINE)
    nm = re.search(r'href="(#whats-new[^"]*)"', readme)
    if not hm:
        failures.append("README.md: first '### What's New in v…' heading not found "
                        "— anchor changed, re-point the gate")
    if not nm:
        failures.append("README.md nav: href=\"#whats-new…\" What's-New link not found "
                        "— anchor changed, re-point the gate")
    if hm and nm:
        expected = "#" + gh_slug(hm.group(1))
        if nm.group(1) != expected:
            failures.append("README nav What's-New anchor: expected %s, found %s"
                            % (expected, nm.group(1)))

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
