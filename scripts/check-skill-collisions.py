#!/usr/bin/env python3
"""check-skill-collisions.py — Cross-skill description-collision detector and
skill structure checks.

A single-skill trigger test proves a skill fires on the right prompts, but it
cannot catch TWO skills whose descriptions are similar enough that a prompt
routes ambiguously between them. This gate computes pairwise similarity across
every skill's frontmatter `description:` and flags near-duplicates:

  - WARN  at Jaccard >= 0.50 (printed; does NOT fail CI)
  - FAIL  at Jaccard >= 0.75 (printed; exits non-zero)

Similarity is Jaccard over distinguishing content tokens: descriptions are
lowercased, tokenized on non-alphanumerics, and stripped of stopwords plus the
shared "trigger this skill when ..." boilerplate, so the score reflects what
separates two skills, not the template they share.

Skill size is not checked here: check-portability.py holds every SKILL.md to
a hard 8,000-byte cap on the whole file (R6), which replaced this script's
warn-only body-size report.

Two structure checks FAIL the run (exit 1):

  - Frontmatter is valid YAML: every SKILL.md's frontmatter
    must parse as a YAML mapping (PyYAML). The regex extraction above reads a
    `description:` line even when the block around it would break a real YAML
    loader; this catches that. Without PyYAML the check is skipped with a
    WARN, unless REQUIRE_YAML=1 (set in CI) turns the skip into a failure.
  - Reference pointers resolve: in each SKILL.md and references/*.md, every
    backticked `references/<file>.md` pointer and every relative Markdown
    link must name a file that exists, and a `§ Heading` cited right after a
    pointer must match a heading in that file. Fenced code blocks (indented
    ones included) are skipped; single-letter placeholders such as
    `references/X.md` are ignored. Not covered: bare "other-skill § heading"
    citations between skills, and helper prompt files (check-portability.py
    checks those carry no frontmatter).

Usage: check-skill-collisions.py [repo-root]   (default: parent of this script's dir)
Exit:  0 = clean · 1 = collision(s) >= FAIL or a structure check failed · 2 = no skills found
"""
import os
import re
import sys
import glob

WARN = 0.50
FAIL = 0.75

# A SKILL.md's frontmatter: the fenced block at the top of the file. Group 1 is
# the frontmatter text; the match end is where the body starts.
FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)

# Stopwords: generic English + the skill-description boilerplate that every
# description shares ("trigger this skill when the user ..."). Removing these
# keeps the comparison on distinguishing terms.
STOP = set("""
a an the this that these those and or but if when while for to of in on at by with from into
your you they it its their them then than as is are be being been was were will would should
skill trigger use used using need needs needed want wants any even seems doesn t don even
before after during about over under out up down off no not only just more most other some
such can may might must shall do does did done here there where which who whom what how why
""".split())

TOKEN = re.compile(r"[a-z0-9]+")

FENCE = re.compile(r"^[ \t]*(```|~~~).*?^[ \t]*\1", re.DOTALL | re.MULTILINE)
# The § capture stops at sentence punctuation but keeps a dot between digits ("Step 2.9").
POINTER = re.compile(r"`(references/[A-Za-z0-9._/-]+\.md)`(?:,?\s*§\s*((?:[^.,;:)`\n—]|\.(?=\d))+))?")
MD_LINK = re.compile(r"\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*$", re.MULTILINE)
PLACEHOLDER = re.compile(r"references/[A-Z]\.md$")


def tokens(text):
    toks = [t for t in TOKEN.findall(text.lower()) if len(t) >= 3 and t not in STOP]
    return set(toks)


def jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def description(path):
    text = open(path, encoding="utf-8").read()
    m = FRONTMATTER.match(text)
    if not m:
        return None
    fm = m.group(1)
    d = re.search(r"^description:[ \t]*(.*)$", fm, re.MULTILINE)
    if not d:
        return None
    val = d.group(1).strip()
    # YAML block scalar ('>' folded or '|' literal, with optional +/- chomping): the
    # real text is on the following more-indented lines. Gather them so a folded
    # description is still compared instead of collapsing to the indicator character
    # (which would token-empty and silently drop the skill from collision detection).
    if re.fullmatch(r"[>|][0-9]*[+-]?", val):
        block = []
        for ln in fm[d.end():].split("\n"):
            if ln.strip() == "":
                continue
            if ln[:1] in (" ", "\t"):
                block.append(ln.strip())
            else:
                break
        joined = " ".join(block).strip()
        return joined or None
    return val.strip("\"'") or None


def yaml_failures(paths, repo):
    """Frontmatter blocks that do not parse as a YAML mapping. Returns
    (failures, skipped) — skipped is True when PyYAML is unavailable."""
    try:
        import yaml
    except ImportError:
        return [], True
    failures = []
    for p in paths:
        m = FRONTMATTER.match(open(p, encoding="utf-8").read())
        if not m:
            failures.append("%s: no frontmatter block" % os.path.relpath(p, repo))
            continue
        try:
            data = yaml.safe_load(m.group(1))
        except yaml.YAMLError as exc:
            first = str(exc).splitlines()[0] if str(exc) else exc.__class__.__name__
            failures.append("%s: frontmatter is not valid YAML (%s)" % (os.path.relpath(p, repo), first))
            continue
        if not isinstance(data, dict):
            failures.append("%s: frontmatter parses, but not as a key/value mapping" % os.path.relpath(p, repo))
    return failures, False


def prefix_at_boundary(text, prefix):
    """True when text starts with prefix and the prefix ends on a word boundary:
    "step 17" does not match "step 1", and "step 2.5" does not match "step 2.9"."""
    if not text.startswith(prefix):
        return False
    rest = text[len(prefix):]
    return not rest or not (rest[0].isalnum() or (rest[0] == "." and rest[1:2].isdigit()))


def pointer_failures(skill_dirs, repo):
    """Unresolvable references/ pointers, relative links, and § headings."""
    failures = []
    for skill_dir in skill_dirs:
        docs = [os.path.join(skill_dir, "SKILL.md")]
        docs += sorted(glob.glob(os.path.join(skill_dir, "references", "*.md")))
        for doc in docs:
            name = os.path.relpath(doc, repo)
            text = FENCE.sub("", open(doc, encoding="utf-8").read())
            for m in POINTER.finditer(text):
                rel, section = m.group(1), m.group(2)
                if PLACEHOLDER.search(rel):
                    continue
                target = os.path.join(skill_dir, rel)
                if not os.path.isfile(target):
                    failures.append("%s: points at %s, which does not exist" % (name, rel))
                    continue
                if section:
                    cited = section.strip().lower()
                    target_text = FENCE.sub("", open(target, encoding="utf-8").read())
                    headings = [h.strip().lower() for h in HEADING.findall(target_text)]
                    # The citation ends wherever the sentence resumes, so accept a
                    # heading that starts with the cited text or the cited text
                    # that starts with a whole heading ("§ Step 17 verification (no …").
                    if not any(prefix_at_boundary(h, cited) or prefix_at_boundary(cited, h) for h in headings):
                        failures.append("%s: cites %s § %s, but no heading there starts with it"
                                        % (name, rel, section.strip()))
            for m in MD_LINK.finditer(text):
                link = m.group(1).split("#", 1)[0]
                if not link or re.match(r"^[a-z][a-z0-9+.-]*:", link) or link.startswith("/"):
                    continue   # anchors, URLs (http:, mailto:), and site-absolute paths
                if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(doc), link))):
                    failures.append("%s: links to %s, which does not exist" % (name, link))
    return failures


def print_structure_report(yaml_fail, yaml_skipped, pointer_fail):
    """Print the two structure checks; return True when either failed."""
    failed = False
    if yaml_skipped:
        if os.environ.get("REQUIRE_YAML") == "1":
            print("\n  FAIL: PyYAML is not installed and REQUIRE_YAML=1 — frontmatter YAML check cannot run")
            failed = True
        else:
            print("\n  WARN: PyYAML not installed — frontmatter YAML check skipped (CI runs it)")
    elif yaml_fail:
        print("\n  FAIL (frontmatter is not valid YAML):")
        for f in yaml_fail:
            print("    " + f)
        failed = True
    else:
        print("\n  Frontmatter parses as YAML in every skill.")
    if pointer_fail:
        print("\n  FAIL (references/ pointers or links that do not resolve):")
        for f in pointer_fail:
            print("    " + f)
        failed = True
    else:
        print("  Every references/ pointer, relative link, and cited § heading resolves.")
    return failed


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else os.path.dirname(script_dir)
    skills_glob = os.path.join(repo, "skills/*/SKILL.md")
    paths = sorted(glob.glob(skills_glob))

    if not paths:
        print("check-skill-collisions: no SKILL.md files found under %s — refusing to pass vacuously" % skills_glob)
        return 2

    skills = []
    for p in paths:
        name = os.path.basename(os.path.dirname(p))
        d = description(p)
        if not d:
            print("  WARN: %s has no frontmatter description" % name)
            continue
        skills.append((name, tokens(d)))

    warns, fails = [], []
    for i in range(len(skills)):
        for j in range(i + 1, len(skills)):
            s = jaccard(skills[i][1], skills[j][1])
            if s >= FAIL:
                fails.append((s, skills[i][0], skills[j][0]))
            elif s >= WARN:
                warns.append((s, skills[i][0], skills[j][0]))

    warns.sort(reverse=True)
    fails.sort(reverse=True)

    yaml_fail, yaml_skipped = yaml_failures(paths, repo)
    pointer_fail = pointer_failures([os.path.dirname(p) for p in paths], repo)

    print("Skill-collision gate — %d skills compared" % len(skills))
    if warns:
        print("\n  WARN (>= %.0f%% similar — review for routing ambiguity, non-blocking):" % (WARN * 100))
        for s, a, b in warns:
            print("    %.0f%%  %s  <->  %s" % (s * 100, a, b))
    if fails:
        print("\n  FAIL (>= %.0f%% similar — near-duplicate descriptions will mis-route):" % (FAIL * 100))
        for s, a, b in fails:
            print("    %.0f%%  %s  <->  %s" % (s * 100, a, b))
        print("\nDisambiguate the FAILing pairs' descriptions (narrow their trigger conditions).")
        print_structure_report(yaml_fail, yaml_skipped, pointer_fail)
        return 1

    print("\n  No skill-description collisions at or above the %.0f%% fail threshold." % (FAIL * 100))
    if not warns:
        print("  No pairs above the %.0f%% warn threshold either." % (WARN * 100))
    structure_failed = print_structure_report(yaml_fail, yaml_skipped, pointer_fail)
    return 1 if structure_failed else 0


if __name__ == "__main__":
    sys.exit(main())
