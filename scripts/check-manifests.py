#!/usr/bin/env python3
"""check-manifests.py — per-host manifest gate for Agent Blueprint (KTD10, KTD11).

One committed manifest per tool points at the shared skills/ tree. Rule ids:

  missing-manifest  every KTD10 manifest exists and parses as JSON.
  name              each plugin manifest and marketplace names agent-blueprint.
  version           every versioned manifest, package.json, and any skill's
                    frontmatter metadata.version equal .claude-plugin/plugin.json.
  skills-key        Codex and Grok manifests declare "skills": "./skills/".
  root-manifest     the root plugin.json (Antigravity) has no "$schema" (Codex
                    then applies the 8,000-byte Agent Plugins skill limit) and no
                    "skills" key.
  pi-package        package.json is private and lists ./skills under "pi".
  hooks-json        no hooks/hooks.json: Grok loads that conventional path from
                    any plugin and would run handlers written for another host.
  hook-files        every hook file a manifest declares exists.

Allowlist: the "manifests" section of scripts/portability-allowlist.json, with
the same shrink-only rules as check-portability.py (stale entries fail).

Usage: check-manifests.py [repo-root] [--allowlist PATH] [--allowlist-base REF]
Exit:  0 = clean · 1 = violation(s) or stale allowlist entries
"""
import json
import os
import re
import subprocess
import sys

NAME = "agent-blueprint"
CANONICAL = ".claude-plugin/plugin.json"
PLUGIN_MANIFESTS = [CANONICAL, ".codex-plugin/plugin.json", "plugin.json",
                    ".grok-plugin/plugin.json", ".cursor-plugin/plugin.json"]
MARKETPLACES = [".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json",
                ".grok-plugin/marketplace.json"]
PACKAGE = "package.json"
NEEDS_SKILLS_KEY = [".codex-plugin/plugin.json", ".grok-plugin/plugin.json"]
ALLOWLIST_SECTION = "manifests"
FRONTMATTER = re.compile(r"^---[ \t]*\n(.*?)\n---[ \t]*(?:\n|$)", re.DOTALL)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def skill_metadata_versions(repo):
    """{skill: metadata.version} for skills whose frontmatter carries one."""
    out = {}
    root = os.path.join(repo, "skills")
    if not os.path.isdir(root):
        return out
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d, "SKILL.md")
        if not os.path.isfile(p):
            continue
        m = FRONTMATTER.match(read(p).replace("\r\n", "\n"))
        if not m:
            continue
        block = m.group(1)
        try:
            import yaml
            data = yaml.safe_load(block) or {}
            ver = (data.get("metadata") or {}).get("version") if isinstance(data, dict) else None
        except ImportError:
            meta = re.search(r"^metadata:\s*\n((?:[ \t]+.*\n?)*)", block, re.MULTILINE)
            vm = re.search(r"^\s+version:\s*[\"']?([^\"'\s]+)", meta.group(1), re.MULTILINE) if meta else None
            ver = vm.group(1) if vm else None
        except Exception:   # noqa: BLE001 - invalid YAML is check-portability's finding
            ver = None
        if ver is not None:
            out[d] = str(ver)
    return out


def collect(repo):
    found = {}

    def add(rel_path, rule, msg):
        found.setdefault((rel_path, rule), []).append(msg)

    docs = {}
    for rel_path in PLUGIN_MANIFESTS + MARKETPLACES + [PACKAGE]:
        p = os.path.join(repo, rel_path)
        if not os.path.isfile(p):
            add(rel_path, "missing-manifest", "KTD10 manifest is missing")
            continue
        try:
            docs[rel_path] = json.loads(read(p))
        except json.JSONDecodeError as exc:
            add(rel_path, "missing-manifest", "not valid JSON (%s)" % exc)

    for rel_path in PLUGIN_MANIFESTS + [PACKAGE]:
        doc = docs.get(rel_path)
        if isinstance(doc, dict) and doc.get("name") != NAME:
            add(rel_path, "name", "name is %r, expected %r" % (doc.get("name"), NAME))
    for rel_path in MARKETPLACES:
        doc = docs.get(rel_path)
        if not isinstance(doc, dict):
            continue
        if doc.get("name") != NAME:
            add(rel_path, "name", "marketplace name is %r, expected %r" % (doc.get("name"), NAME))
        for entry in doc.get("plugins") or []:
            if isinstance(entry, dict) and entry.get("name") != NAME:
                add(rel_path, "name", "plugin entry name is %r, expected %r" % (entry.get("name"), NAME))

    canonical = (docs.get(CANONICAL) or {}).get("version")
    if canonical is None and CANONICAL in docs:
        add(CANONICAL, "version", "no version field; it is the canonical release version")
    if canonical is not None:
        for rel_path in PLUGIN_MANIFESTS + [PACKAGE]:
            doc = docs.get(rel_path)
            if not isinstance(doc, dict) or rel_path == CANONICAL:
                continue
            if doc.get("version") != canonical:
                add(rel_path, "version", "version %r differs from %s (%s)" % (doc.get("version"), CANONICAL, canonical))
        for rel_path in MARKETPLACES:
            for entry in (docs.get(rel_path) or {}).get("plugins") or []:
                if isinstance(entry, dict) and "version" in entry and entry["version"] != canonical:
                    add(rel_path, "version", "plugin entry version %r differs from %s (%s)"
                        % (entry["version"], CANONICAL, canonical))
        for skill, ver in skill_metadata_versions(repo).items():
            if ver != canonical:
                add("skills/%s/SKILL.md" % skill, "version", "metadata.version %s differs from the release %s"
                    % (ver, canonical))

    for rel_path in NEEDS_SKILLS_KEY:
        doc = docs.get(rel_path)
        if isinstance(doc, dict) and doc.get("skills") not in ("./skills/", "./skills"):
            add(rel_path, "skills-key", 'needs "skills": "./skills/" (found %r)' % (doc.get("skills"),))

    root = docs.get("plugin.json")
    if isinstance(root, dict):
        if "$schema" in root:
            add("plugin.json", "root-manifest", "root plugin.json must not declare $schema: Codex then truncates "
                "every SKILL.md at 8,000 bytes under the Agent Plugins limits")
        if "skills" in root:
            add("plugin.json", "root-manifest", "root plugin.json carries no skills key (KTD10)")

    pkg = docs.get(PACKAGE)
    if isinstance(pkg, dict):
        if pkg.get("private") is not True:
            add(PACKAGE, "pi-package", 'package.json must be "private": true')
        skills = (pkg.get("pi") or {}).get("skills") if isinstance(pkg.get("pi"), dict) else None
        if not isinstance(skills, list) or not ({"./skills", "./skills/"} & set(skills)):
            add(PACKAGE, "pi-package", 'package.json needs "pi": {"skills": ["./skills"]}')

    if os.path.exists(os.path.join(repo, "hooks", "hooks.json")):
        add("hooks/hooks.json", "hooks-json", "Grok loads hooks/hooks.json from any plugin; declare per-host hook "
            "files by path instead (KTD11)")

    for rel_path, doc in docs.items():
        if not isinstance(doc, dict) or "hooks" not in doc:
            continue
        declared = doc["hooks"]
        paths = declared if isinstance(declared, list) else [declared] if isinstance(declared, str) else []
        for hp in paths:
            if not os.path.isfile(os.path.normpath(os.path.join(repo, hp))):
                add(rel_path, "hook-files", "declared hook file %s does not exist" % hp)
    return found


def load_allowlist(path, section):
    if not path or not os.path.isfile(path):
        return set()
    data = json.loads(read(path))
    return {(p, r) for p, rules in (data.get(section) or {}).items() for r in rules}


def base_allowlist(repo, ref, rel_path, section):
    try:
        out = subprocess.run(["git", "-C", repo, "show", "%s:%s" % (ref, rel_path)],
                             capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    data = json.loads(out)
    return {(p, r) for p, rules in (data.get(section) or {}).items() for r in rules}


def main(argv):
    args, allowlist, base_ref = [], None, None
    it = iter(argv)
    for a in it:
        if a == "--allowlist":
            allowlist = next(it)
        elif a == "--allowlist-base":
            base_ref = next(it)
        else:
            args.append(a)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(args[0]) if args else os.path.dirname(script_dir)
    allowlist = allowlist or os.path.join(repo, "scripts", "portability-allowlist.json")

    found = collect(repo)
    allowed = load_allowlist(allowlist, ALLOWLIST_SECTION)
    failures = sorted(k for k in found if k not in allowed)
    stale = sorted(allowed - set(found))
    grew = []
    if base_ref:
        base = base_allowlist(repo, base_ref, os.path.relpath(allowlist, repo), ALLOWLIST_SECTION)
        if base is not None:
            grew = sorted(allowed - base)

    print("Manifest gate — %s" % repo)
    if failures:
        print("\n  FAIL (%d):" % len(failures))
        for key in failures:
            for msg in found[key]:
                print("    %s: [%s] %s" % (key[0], key[1], msg))
    if stale:
        print("\n  FAIL — allowlist entries that no longer match a violation (remove them; the list only shrinks):")
        for p, r in stale:
            print("    %s: [%s]" % (p, r))
    if grew:
        print("\n  FAIL — allowlist entries added since %s (fix the violation instead of allowlisting it):" % base_ref)
        for p, r in grew:
            print("    %s: [%s]" % (p, r))
    held = sorted(k for k in found if k in allowed)
    if held:
        print("\n  Allowlisted (%d entries, drained by later units):" % len(held))
        for p, r in held:
            print("    %s: [%s]" % (p, r))
    if not (failures or stale or grew):
        print("\n  OK — no violations beyond the allowlist.")
    return 1 if (failures or stale or grew) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
