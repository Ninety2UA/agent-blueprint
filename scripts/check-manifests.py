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
import importlib.util
import json
import os
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


def _load_portability_gate():
    """check-portability.py as a module: its frontmatter parser, allowlist
    handling and report layout are shared, so both gates read the allowlist alike."""
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location("check_portability", os.path.join(here, "check-portability.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


GATE = _load_portability_gate()


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def skill_metadata_versions(repo):
    """{skill: metadata.version} for skills whose frontmatter carries one."""
    out = {}
    for skill_dir in GATE.skill_dirs(repo):
        data, err = GATE.parse_frontmatter(read(os.path.join(skill_dir, "SKILL.md")))
        if err:   # invalid frontmatter is check-portability's finding
            continue
        meta = data.get("metadata")
        ver = meta.get("version") if isinstance(meta, dict) else None
        if ver is not None:
            out[os.path.basename(skill_dir)] = str(ver)
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


def main(argv):
    repo, allowlist, base_ref = GATE.parse_args(argv, __file__)
    found = collect(repo)
    status = GATE.allowlist_status(repo, found, allowlist, ALLOWLIST_SECTION, base_ref)
    print("Manifest gate — %s" % repo)
    GATE.print_findings(found, status, base_ref)
    bad = status[0] or status[1] or status[2]
    if not bad:
        print("\n  OK — no violations beyond the allowlist.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
