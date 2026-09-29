#!/usr/bin/env python3
"""Scaffold a project from this skill's assets/ without overwriting anything.

Usage: python3 scaffold.py <project-dir> [--dry-run]

- Files the project lacks are copied from assets/.
- AGENTS.md that exists gains the template's sections it does not have yet;
  its own sections are never changed or removed.
- CLAUDE.md that exists gains an `@AGENTS.md` line at the top, so Claude Code
  loads AGENTS.md too; the rest of the file is kept. A CLAUDE.md that is the
  same file as AGENTS.md (a symlink either way) is left alone.
- .gitignore files gain the template lines they are missing.
- Every other file that exists is kept as it is.
- In an empty project (nothing but .git), src/, tests/ and infra/ are created
  with a .gitkeep each.

Dotfiles are stored without their dot (assets/gitignore), because package
managers and glob copies drop dotfiles; RENAMES maps them back.

Prints one line per file, "created", "merged" or "kept", then a summary.
Standard library only.
"""
import os
import re
import shutil
import sys

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
RENAMES = {"gitignore": ".gitignore", "agent-blueprint/gitignore": ".agent-blueprint/.gitignore"}
PLACEHOLDER_DIRS = ("src", "tests", "infra")
HEADING = re.compile(r"^## +(.+?)\s*$", re.MULTILINE)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def sections(text):
    """[(heading, text)] for each ## section, in order."""
    marks = list(HEADING.finditer(text))
    return [(m.group(1).strip().lower(), text[m.start():marks[i + 1].start() if i + 1 < len(marks) else len(text)])
            for i, m in enumerate(marks)]


def merge_agents(target, template):
    """Append the template's ## sections that the target lacks. None when nothing changes."""
    have = {h for h, _ in sections(target)}
    missing = [body.rstrip() + "\n" for h, body in sections(template) if h not in have]
    if not missing:
        return None
    return target.rstrip() + "\n\n" + "\n".join(missing)


def merge_claude(target):
    if any(line.strip() == "@AGENTS.md" for line in target.splitlines()):
        return None
    return "@AGENTS.md\n\n" + target


def merge_lines(target, template):
    have = {line.strip() for line in target.splitlines()}
    missing = [line for line in template.splitlines() if line.strip() and line.strip() not in have]
    if not missing:
        return None
    return target.rstrip("\n") + "\n\n" + "\n".join(missing) + "\n"


def same_file(a, b):
    """True when both paths reach one file: a symlink either way, or a hard link."""
    try:
        return os.path.samefile(a, b)
    except OSError:
        return False


def plan(project):
    """[(action, rel, new_text_or_source)] without touching the disk."""
    actions = []
    for root, dirs, files in os.walk(ASSETS):
        dirs.sort()
        for name in sorted(files):
            src = os.path.join(root, name)
            rel = os.path.relpath(src, ASSETS).replace(os.sep, "/")
            rel = RENAMES.get(rel, rel)
            dest = os.path.join(project, rel)
            if not os.path.lexists(dest):
                actions.append(("created", rel, src))
                continue
            if rel == "CLAUDE.md" and same_file(dest, os.path.join(project, "AGENTS.md")):
                actions.append(("kept", rel, None))
                continue
            merged = None
            if rel == "AGENTS.md":
                merged = merge_agents(read(dest), read(src))
            elif rel == "CLAUDE.md":
                merged = merge_claude(read(dest))
            elif rel.endswith(".gitignore"):
                merged = merge_lines(read(dest), read(src))
            actions.append(("merged", rel, merged) if merged is not None else ("kept", rel, None))
    entries = [e for e in os.listdir(project) if e != ".git"] if os.path.isdir(project) else []
    if not entries:
        for d in PLACEHOLDER_DIRS:
            actions.append(("created", d + "/.gitkeep", ""))
    return actions


def apply(project, actions):
    for action, rel, payload in actions:
        dest = os.path.join(project, rel)
        if action == "kept":
            continue
        os.makedirs(os.path.dirname(dest) or project, exist_ok=True)
        if action == "created" and payload and os.path.isfile(payload):
            shutil.copyfile(payload, dest)
        else:
            with open(dest, "w", encoding="utf-8") as fh:
                fh.write(payload or "")


def main(argv):
    args = [a for a in argv if a != "--dry-run"]
    if len(args) != 1:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    project = os.path.abspath(args[0])
    if not os.path.isdir(ASSETS):
        print("scaffold: no assets folder at %s" % ASSETS, file=sys.stderr)
        return 1
    actions = plan(project)
    if "--dry-run" not in argv:
        os.makedirs(project, exist_ok=True)
        apply(project, actions)
    for action, rel, _ in actions:
        print("%-8s %s" % (action, rel))
    counts = {a: sum(1 for x in actions if x[0] == a) for a in ("created", "merged", "kept")}
    print("scaffold: %(created)d created, %(merged)d merged, %(kept)d kept" % counts)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
