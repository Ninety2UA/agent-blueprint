#!/usr/bin/env python3
"""check-site.py: the built-site gate (KTD5). Checks a built site folder against the repository tree.

Ground truth comes from the tree. Helper prompts, hooks and the version follow the rules
scripts/check-drift.sh uses; the skill rule is this gate's own:
  skills         folders under skills/ that hold a SKILL.md. check-drift.sh counts SKILL.md files, so the
                 two agree while no skill nests a SKILL.md; the RealTree test in
                 tests/gates/test_check_site.py cross-checks them
  helper prompts distinct file names under skills/*/references/agents/, companion notes left out
                 (<prompt>-<topic>.md beside <prompt>.md; is_companion() in tests/gates/test_prompt_files.py)
  hooks          "command" entries in hooks/claude-code.json
  tools          rows of the README install table (Tool | Command | Install route | Support note)
  version        .claude-plugin/plugin.json "version"

Checks on the built site:
  - one page per skill folder at skills/<name>/index.html, and none for a name that is not a folder;
  - on skills/index.html, one element with data-helper="<name>" per helper prompt, each exactly once;
  - every element with data-claim="skills|helpers|hooks|tools|version" states the tree's value: the first
    number in its text (a numeral, or a number word such as "eight"), or a version with or without a
    leading "v". Text without data-claim is never a current-state claim, so old release notes may
    quote old counts;
  - no file named SKILL.md anywhere in the build output;
  - none of the adoption wording in adoption-denylist.json (beside this script), reported once per line;
  - every root-relative href and src resolves to a file in the build (a path ending in / means its
    index.html; a path that climbs out of the build fails); fragments, query strings, external URLs and
    mailto links are not checked;
  - every page has a title, a meta description and a canonical link (404.html needs no canonical).
Astro's _astro/ and Pagefind's pagefind/ folders hold no pages and are skipped, except by the SKILL.md check.

Usage: check-site.py <dist> [repo-root]
  repo-root defaults to the parent of this script's folder.

Exit codes: 0 = the site matches the tree · 1 = problems found · 2 = the build or the ground truth is
missing or empty (a missing source fails loudly rather than passing vacuously).
"""
import json
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SKIPPED_DIRS = ("_astro", "pagefind")
TEXT_EXTENSIONS = (".html", ".txt", ".xml", ".json")
CLAIM_KINDS = ("skills", "helpers", "hooks", "tools", "version")
NUMBER_WORDS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
                "eleven", "twelve")
NUMBER = re.compile(r"(?<![\w.])(\d+|%s)(?![\w.])" % "|".join(NUMBER_WORDS), re.IGNORECASE)
VERSION = re.compile(r"(?<![\w.])v?(\d+\.\d+\.\d+)(?![\w.])")
INSTALL_HEADER = ["Tool", "Command", "Install route", "Support note"]
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class MissingTruth(Exception):
    """The build or a ground-truth source is missing or empty: exit 2."""


# ── Ground truth from the tree ────────────────────────────────────────────

def is_companion(folder, stem):
    """<prompt>-<topic>.md beside <prompt>.md is a note the prompt loads, not a prompt (check-drift.sh's rule)."""
    return any(os.path.isfile(os.path.join(folder, stem[:i] + ".md")) for i, ch in enumerate(stem) if ch == "-")


def ground_truth(repo):
    skills_dir = os.path.join(repo, "skills")
    folders = []
    if os.path.isdir(skills_dir):
        folders = sorted(d for d in os.listdir(skills_dir) if os.path.isfile(os.path.join(skills_dir, d, "SKILL.md")))
    if not folders:
        raise MissingTruth("skills/: no skill folders under %s" % repo)

    helpers = set()
    for skill in os.listdir(skills_dir):
        agents = os.path.join(skills_dir, skill, "references", "agents")
        if os.path.isdir(agents):
            helpers.update(name[:-3] for name in os.listdir(agents)
                           if name.endswith(".md") and os.path.isfile(os.path.join(agents, name))
                           and not is_companion(agents, name[:-3]))
    if not helpers:
        raise MissingTruth("skills/*/references/agents/: no helper prompts")

    try:
        with open(os.path.join(repo, "hooks", "claude-code.json"), encoding="utf-8") as fh:
            hook_groups = json.load(fh).get("hooks", {}).values()
        hooks = sum(1 for groups in hook_groups for group in groups for hook in group.get("hooks", [])
                    if hook.get("type") == "command")
    except (OSError, ValueError, AttributeError) as exc:
        raise MissingTruth("hooks/claude-code.json: cannot read the hook handlers (%s)" % exc)
    if not hooks:
        raise MissingTruth("hooks/claude-code.json: no command hooks")

    try:
        with open(os.path.join(repo, "README.md"), encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except OSError as exc:
        raise MissingTruth("README.md: cannot read (%s)" % exc.strerror)
    start = next((i for i, line in enumerate(lines) if line.lstrip().startswith("|")
                  and [c.strip() for c in line.strip().strip("|").split("|")] == INSTALL_HEADER), None)
    if start is None:
        raise MissingTruth("README.md: install table (%s) not found" % " | ".join(INSTALL_HEADER))
    tools = 0
    for line in lines[start + 2:]:
        if not line.lstrip().startswith("|"):
            break
        tools += 1
    if not tools:
        raise MissingTruth("README.md: the install table has no rows")

    try:
        with open(os.path.join(repo, ".claude-plugin", "plugin.json"), encoding="utf-8") as fh:
            version = json.load(fh)["version"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise MissingTruth(".claude-plugin/plugin.json: no version (%s)" % exc)

    return {"folders": folders, "helper_names": helpers, "skills": len(folders), "helpers": len(helpers),
            "hooks": hooks, "tools": tools, "version": version}


def load_denylist():
    """The adoption denylist beside this script, compiled as scripts/check-drift.sh compiles it."""
    try:
        with open(os.path.join(SCRIPT_DIR, "adoption-denylist.json"), encoding="utf-8") as fh:
            data = json.load(fh)
        gap, phrases = data["gap"], data["phrases"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise MissingTruth("scripts/adoption-denylist.json: cannot read the denylist (%s)" % exc)
    return re.compile(r"(?<![a-z0-9])(?<!\w_)(?:%s)(?![a-z0-9])(?!_\w)"
                      % "|".join(p.replace(" ", gap) for p in phrases), re.IGNORECASE)


# ── One HTML page ─────────────────────────────────────────────────────────

class Page(HTMLParser):
    """Collects what the checks need from one page: metadata, links, claims and helper entries."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None
        self.description = None
        self.canonical = None
        self.links = []          # root-relative href and src values, in order
        self.claims = []         # (kind, text)
        self.helpers = []        # data-helper values
        self._open = []          # [kind, tag, depth, text parts] for each open data-claim element
        self._svg = 0
        self._title = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ("href", "src"):
            if a.get(key):
                self.links.append(a[key])
        if a.get("data-helper") is not None:
            self.helpers.append(a["data-helper"])
        if tag == "svg":
            self._svg += 1
        elif tag == "title" and not self._svg and self.title is None:
            self._title = []
        elif tag == "meta" and (a.get("name") or "").lower() == "description" and self.description is None:
            self.description = a.get("content") or ""
        elif tag == "link" and "canonical" in (a.get("rel") or "").lower().split() and self.canonical is None:
            self.canonical = a.get("href") or ""
        if tag in VOID:
            return
        for claim in self._open:
            if claim[1] == tag:
                claim[2] += 1
        if "data-claim" in a:
            self._open.append([a["data-claim"] or "", tag, 1, []])

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == "svg" and self._svg:
            self._svg -= 1
        elif tag == "title" and self._title is not None:
            self.title, self._title = "".join(self._title), None
        for claim in list(self._open):
            if claim[1] == tag:
                claim[2] -= 1
                if claim[2] == 0:
                    self._open.remove(claim)
                    self.claims.append((claim[0], " ".join("".join(claim[3]).split())))

    def handle_data(self, data):
        if self._title is not None:
            self._title.append(data)
        for claim in self._open:
            claim[3].append(data)


# ── The checks ────────────────────────────────────────────────────────────

def walk(dist):
    """(relative path, absolute path) of every file in the build, sorted."""
    for root, dirs, files in os.walk(dist):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(root, name)
            yield os.path.relpath(path, dist).replace(os.sep, "/"), path


def skipped(rel):
    return rel.split("/", 1)[0] in SKIPPED_DIRS


def resolves(dist, path):
    """Whether a root-relative path (fragment and query already removed) names a file in the build."""
    target = os.path.normpath(os.path.join(dist, unquote(path).lstrip("/")))
    if os.path.commonpath([dist, target]) != dist:
        return False
    if path.endswith("/"):
        return os.path.isfile(os.path.join(target, "index.html"))
    return os.path.isfile(target) or os.path.isfile(os.path.join(target, "index.html"))


def check_claim(rel, kind, text, truth):
    if kind not in CLAIM_KINDS:
        return '%s: data-claim="%s" is not one of %s' % (rel, kind, ", ".join(CLAIM_KINDS))
    if kind == "version":
        m = VERSION.search(text)
        found = m.group(1) if m else None
    else:
        m = NUMBER.search(text)
        found = None
        if m:
            word = m.group(1).lower()
            found = int(word) if word.isdigit() else NUMBER_WORDS.index(word)
    if found is None:
        return "%s: data-claim=\"%s\" says '%s', which holds no %s" \
            % (rel, kind, text, "version" if kind == "version" else "count")
    if found != truth[kind]:
        return "%s: data-claim=\"%s\" says '%s', the tree has %s" % (rel, kind, text, truth[kind])
    return None


def check(dist, truth, adoption):
    failures = []
    pages = {}
    for rel, path in walk(dist):
        if os.path.basename(rel) == "SKILL.md":
            failures.append("%s: a file named SKILL.md in the build output; SKILL.md files live only in "
                            "skills/<name>/" % rel)
        if skipped(rel) or not rel.endswith(TEXT_EXTENSIONS):
            continue
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
        except UnicodeDecodeError:
            continue
        reported = set()
        for hit in adoption.finditer(text):
            lineno = text.count("\n", 0, hit.start()) + 1
            if lineno not in reported:
                reported.add(lineno)
                failures.append("%s:%d: adoption or ecosystem claim '%s'; the public docs describe the blueprint "
                                "itself" % (rel, lineno, " ".join(hit.group(0).split())))
        if rel.endswith(".html"):
            page = Page()
            page.feed(text)
            page.close()
            pages[rel] = page
    if not pages:
        raise MissingTruth("%s: no built site (no HTML pages)" % dist)

    # One page per skill folder, and no page for a name that is not one.
    built = {rel.split("/")[1] for rel in pages if re.fullmatch(r"skills/[^/]+/index\.html", rel)}
    for name in truth["folders"]:
        if name not in built:
            failures.append("skills/%s/index.html: missing; the skill folder skills/%s/ has no page" % (name, name))
    for name in sorted(built - set(truth["folders"])):
        failures.append("skills/%s/index.html: a page for %s, which is not a skill folder in the tree" % (name, name))

    # One helper entry per helper prompt on the Skills page.
    catalog = pages.get("skills/index.html")
    if catalog is None:
        failures.append("skills/index.html: missing; the helper entries (data-helper) live on the Skills page")
    else:
        for name in sorted(truth["helper_names"] | set(catalog.helpers)):
            n = catalog.helpers.count(name)
            if name not in truth["helper_names"]:
                failures.append("skills/index.html: helper entry %s names no helper prompt in the tree" % name)
            elif n == 0:
                failures.append("skills/index.html: no helper entry (data-helper) for the helper prompt %s" % name)
            elif n > 1:
                failures.append("skills/index.html: helper entry %s appears %d times; expected once" % (name, n))

    for rel, page in pages.items():
        for kind, text in page.claims:
            problem = check_claim(rel, kind, text, truth)
            if problem:
                failures.append(problem)
        broken = []
        for href in page.links:
            path = href.split("#", 1)[0].split("?", 1)[0]
            if path.startswith("/") and not path.startswith("//") and path not in broken and not resolves(dist, path):
                broken.append(path)
        failures.extend("%s: broken link %s" % (rel, path) for path in broken)
        if not (page.title or "").strip():
            failures.append("%s: no title" % rel)
        if not (page.description or "").strip():
            failures.append("%s: no meta description" % rel)
        if rel != "404.html" and not (page.canonical or "").strip():
            failures.append("%s: no canonical link" % rel)
    return failures


def main(argv):
    if len(argv) < 2:
        print("Usage: check-site.py <dist> [repo-root]")
        return 2
    dist = os.path.abspath(argv[1])
    repo = os.path.abspath(argv[2]) if len(argv) > 2 else os.path.dirname(SCRIPT_DIR)
    print("")
    print("Site gate: %s against %s" % (dist, repo))
    try:
        truth = ground_truth(repo)
        adoption = load_denylist()
        print("  Ground truth (from the tree): %d skills, %d helper prompts, %d hooks, %d tools; version %s"
              % (truth["skills"], truth["helpers"], truth["hooks"], truth["tools"], truth["version"]))
        if not os.path.isdir(dist):
            raise MissingTruth("%s: no built site (folder not found); run the site build first" % dist)
        failures = check(dist, truth, adoption)
    except MissingTruth as exc:
        print("  %s" % exc)
        print("  The build or a ground-truth source is missing: refusing to pass vacuously.")
        return 2
    print("")
    if failures:
        print("SITE CHECK FAILED: %d problem(s):" % len(failures))
        print("")
        for f in failures:
            print("  " + f)
        print("")
        print("Fix each LOCATION, or the source that generates it, and rebuild.")
        return 1
    print("OK: the built site matches the tree (%d skill pages, %d helper entries, every claim, link and "
          "page header checked)." % (truth["skills"], truth["helpers"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
