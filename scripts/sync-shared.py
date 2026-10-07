#!/usr/bin/env python3
"""sync-shared.py — rewrite every copy of shared text from its owner (KTD2, KTD3, KTD14, KTD17).

Two kinds of shared text, both registered in scripts/prompt-owners.json:

  snippets  "snippet_owner" names one markdown file. Each "## <id>" section's first
            paragraph is a canonical snippet that opens with a bold label, such as
            "**Helper step.**". Any paragraph in a skill that opens with that label is
            a copy and must equal the snippet byte for byte (indentation aside). The
            site-specific line that follows a copy is its own paragraph and is never
            touched.
  files     "shared" lists {"owner": path, "copies": [path, ...]}: whole files (prompt
            files, the v4 name map, host-limits.tsv) kept byte-identical to the owner.

Default mode rewrites drifted copies in place and prints what changed; a second run
changes nothing. --check changes nothing and exits 1 on any drift; the portability
gate runs the same check (check-portability.py rules snippet-drift, copy-drift,
owner-missing).

Usage: sync-shared.py [repo-root] [--check]
Exit:  0 = in sync (or synced) · 1 = drift found in --check mode, or a copy that
       needs a hand fix (a snippet run into another paragraph, a missing owner)
"""
import json
import os
import re
import sys

# CommonMark fences: a run of 3+ backticks (info string without backticks) or 3+ tildes,
# closed by a run of the same character at least as long, followed only by whitespace.
FENCE_OPEN = re.compile(r"^[ \t]*(?:(`{3,})[^`]*|(~{3,}).*)$")
LABEL = re.compile(r"^\*\*[^*\n]+\*\*")
LIST_LEAD = re.compile(r"^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)*")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def load_registry(repo):
    p = os.path.join(repo, "scripts", "prompt-owners.json")
    return json.loads(read(p)) if os.path.isfile(p) else {}


def fence_lines(lines):
    """Set of 0-based line indexes inside fenced code blocks (an unclosed fence runs to the end)."""
    close, out = None, set()
    for i, line in enumerate(lines):
        if close:
            out.add(i)
            if close.match(line):
                close = None
            continue
        m = FENCE_OPEN.match(line)
        if m:
            run = m.group(1) or m.group(2)
            close = re.compile(r"^[ \t]*%s{%d,}[ \t]*$" % (re.escape(run[0]), len(run)))
            out.add(i)
    return out


def blank_fences(text):
    """text with every fenced line emptied, so line numbers stay put."""
    lines = text.split("\n")
    fenced = fence_lines(lines)
    return "\n".join("" if i in fenced else line for i, line in enumerate(lines))


def blocks(text):
    """(first, last) 0-based line ranges of blank-line-separated paragraphs outside fences."""
    lines = text.split("\n")
    fenced = fence_lines(lines)
    out, start = [], None
    for i, line in enumerate(lines):
        if i in fenced or not line.strip():
            if start is not None:
                out.append((start, i - 1))
                start = None
            continue
        if start is None:
            start = i
    if start is not None:
        out.append((start, len(lines) - 1))
    return lines, out


def dedent(block_lines):
    indent = re.match(r"^[ \t]*", block_lines[0]).group(0)
    if all(l.startswith(indent) for l in block_lines):
        return indent, [l[len(indent):] for l in block_lines]
    return "", block_lines


def snippets(repo, registry):
    """({label: canonical text}, owner path or None, missing owner rel path or None)."""
    owner = registry.get("snippet_owner")
    if not owner:
        return {}, None, None
    path = os.path.join(repo, owner)
    if not os.path.isfile(path):
        return {}, None, owner
    out = {}
    text = blank_fences(read(path))
    for section in re.split(r"^## .*$", text, flags=re.MULTILINE)[1:]:
        lines, ranges = blocks(section)
        if ranges:
            first = "\n".join(lines[ranges[0][0]:ranges[0][1] + 1])
            label = LABEL.match(first)
            if label:
                out[label.group(0)] = first
    return out, path, None


def skill_prose(repo):
    root = os.path.join(repo, "skills")
    if not os.path.isdir(root):
        return
    for d in sorted(os.listdir(root)):
        skill = os.path.join(root, d)
        if not os.path.isfile(os.path.join(skill, "SKILL.md")):
            continue
        for dirpath, dirs, files in os.walk(skill):
            dirs[:] = sorted(x for x in dirs if x not in ("assets", "node_modules", "__pycache__"))
            for name in sorted(files):
                if name.endswith(".md"):
                    yield os.path.join(dirpath, name)


def snippet_drift(text, snips):
    """[(line_no, label, kind, (first, last, indent) or None)] for copies in text.

    kind is 'drift' (a paragraph of its own that differs: rewrite it), 'run-on' (text
    written right under the snippet in the same paragraph) or 'run-in' (the label opens
    a later line or a list item); the last two need a hand fix, so sync never deletes text.
    """
    lines, ranges = blocks(text)
    found = []
    for first, last in ranges:
        indent, body = dedent(lines[first:last + 1])
        para = "\n".join(body)
        for label, canon in snips.items():
            if para.startswith(label):
                if len(body) > canon.count("\n") + 1:
                    found.append((first + 1, label, "run-on", None))
                elif para != canon:
                    found.append((first + 1, label, "drift", (first, last, indent)))
                continue
            for k, line in enumerate(body):
                if LIST_LEAD.sub("", line).startswith(label):
                    found.append((first + k + 1, label, "run-in", None))
    return found


def find_drift(repo, registry=None):
    """[(path, rule, message)] — the checks check-portability.py reports."""
    registry = load_registry(repo) if registry is None else registry
    out = []
    snips, owner_path, missing = snippets(repo, registry)
    if missing:
        out.append((os.path.join(repo, missing), "owner-missing", "snippet owner file does not exist"))
    if snips:
        for path in skill_prose(repo):
            if owner_path and os.path.samefile(path, owner_path):
                continue
            for line, label, kind, _ in snippet_drift(read(path), snips):
                if kind == "drift":
                    out.append((path, "snippet-drift", "line %d: the %s snippet differs from its owner; run "
                                "python3 scripts/sync-shared.py" % (line, label)))
                elif kind == "run-on":
                    out.append((path, "snippet-drift", "line %d: the %s snippet must be a paragraph of its own; "
                                "add a blank line between it and the following text" % (line, label)))
                else:
                    out.append((path, "snippet-drift", "line %d: the %s snippet must be a paragraph of its own, "
                                "with a blank line before and after" % (line, label)))
    for entry in registry.get("shared", []):
        owner = os.path.join(repo, entry["owner"])
        if not os.path.isfile(owner):
            out.append((owner, "owner-missing", "registered owner does not exist"))
            continue
        with open(owner, "rb") as fh:
            body = fh.read()
        for copy in entry.get("copies", []):
            cp = os.path.join(repo, copy)
            parts = copy.split("/")
            if parts[0] == "skills" and len(parts) > 2 and not os.path.isdir(os.path.join(repo, "skills", parts[1])):
                out.append((cp, "owner-missing", "copy location's skill does not exist"))
            elif not os.path.isfile(cp):
                out.append((cp, "copy-drift", "registered copy is missing; run python3 scripts/sync-shared.py"))
            else:
                with open(cp, "rb") as fh:
                    if fh.read() != body:
                        out.append((cp, "copy-drift", "differs from its owner %s; run python3 scripts/sync-shared.py"
                                    % entry["owner"]))
    return out


def sync(repo, registry=None):
    """Rewrite drifted copies. Returns (changed paths, problems needing a hand fix)."""
    registry = load_registry(repo) if registry is None else registry
    changed, problems = [], []
    snips, owner_path, missing = snippets(repo, registry)
    if missing:
        problems.append("%s: snippet owner file does not exist" % missing)
    if snips:
        for path in skill_prose(repo):
            if owner_path and os.path.samefile(path, owner_path):
                continue
            text = read(path)
            hits = snippet_drift(text, snips)
            if not hits:
                continue
            lines = text.split("\n")
            for line, label, kind, span in sorted(hits, key=lambda h: -h[0]):
                if kind == "run-on":
                    problems.append("%s:%d: the %s snippet has text right under it; add a blank line between them"
                                    % (os.path.relpath(path, repo), line, label))
                    continue
                if kind == "run-in":
                    problems.append("%s:%d: the %s snippet is run into another paragraph; fix it by hand"
                                    % (os.path.relpath(path, repo), line, label))
                    continue
                first, last, indent = span
                lines[first:last + 1] = [indent + l if l else l for l in snips[label].split("\n")]
            new = "\n".join(lines)
            if new != text:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(new)
                changed.append(path)
    for entry in registry.get("shared", []):
        owner = os.path.join(repo, entry["owner"])
        if not os.path.isfile(owner):
            problems.append("%s: registered owner does not exist" % entry["owner"])
            continue
        with open(owner, "rb") as fh:
            body = fh.read()
        for copy in entry.get("copies", []):
            cp = os.path.join(repo, copy)
            parts = copy.split("/")
            if parts[0] == "skills" and len(parts) > 2 and not os.path.isdir(os.path.join(repo, "skills", parts[1])):
                problems.append("%s: copy location's skill does not exist" % copy)
                continue
            current = None
            if os.path.isfile(cp):
                with open(cp, "rb") as fh:
                    current = fh.read()
            if current != body:
                os.makedirs(os.path.dirname(cp), exist_ok=True)
                with open(cp, "wb") as fh:
                    fh.write(body)
                changed.append(cp)
    return changed, problems


def main(argv):
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(args[0]) if args else os.path.dirname(script_dir)
    if check:
        drift = find_drift(repo)
        for path, rule, msg in drift:
            print("%s: [%s] %s" % (os.path.relpath(path, repo), rule, msg))
        print("sync-shared --check: %s" % ("%d drift(s)" % len(drift) if drift else "every copy matches its owner"))
        return 1 if drift else 0
    changed, problems = sync(repo)
    for path in changed:
        print("synced %s" % os.path.relpath(path, repo))
    for p in problems:
        print("needs a hand fix: %s" % p)
    print("sync-shared: %d file(s) rewritten" % len(changed))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
