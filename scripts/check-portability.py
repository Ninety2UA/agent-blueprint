#!/usr/bin/env python3
"""check-portability.py — skill-level portability gate for Agent Blueprint (KTD5).

Every rule below has an id; a violation prints "path: [rule-id] message".

  frontmatter        SKILL.md frontmatter parses, and uses only agentskills keys
                     (name, description, license, compatibility, metadata,
                     allowed-tools) plus argument-hint and disable-model-invocation;
                     never effort or model (R5, R12). Prompt files carry none.
  name               name is 1-64 chars of a-z, 0-9 and single hyphens, starts
                     with ab-, and matches its directory (R9).
  description        description is 1-1,024 characters (R6).
  size               the whole SKILL.md, frontmatter included and line endings
                     normalized, is at most 8,000 bytes (R6; Codex truncates there).
  banned-token       no $ARGUMENTS, no host path or session variables such as
                     ${CLAUDE_PLUGIN_ROOT}, no load-time !`command` pre-resolution (R8).
  path-escape        no link or path that leaves the skill directory: ../ or
                     another skill's skills/ab-<name>/ path (R8).
  slash-ref          no /name reference to a skill; name skills in prose (KTD4).
  instructions-write no instruction to modify AGENTS.md or CLAUDE.md; skills name
                     "the project instructions file" (KTD8). Hermes quarantines a
                     skill that tells the agent to edit either file.
  snippet-drift      a paragraph that opens with a capability snippet's label
                     matches the owner snippet byte for byte (KTD3).
  copy-drift         every registered copy of a shared file matches its owner (KTD2).
  owner-missing      every registered owner file and copy location exists.
  manual-only        a manual-only skill (disable-model-invocation: true) has
                     agents/openai.yaml with allow_implicit_invocation: false and
                     the reverse; no other skill references it (R10, KTD12).
  hermes-pattern     no text Hermes treats as prompt injection in a context file
                     or as a critical finding in a skill (blocked or quarantined).
  html-comment       no HTML comment in instruction, skill or prompt files; Hermes
                     drops a context file that has one (KTD8).
  instructions-length the root and template AGENTS.md stay within 200 lines (R15).
  stray-skill-md     no file named SKILL.md outside skills/<name>/ (KTD1): the whole
                     repository installs as the plugin.

Allowlist: scripts/portability-allowlist.json holds today's violations as
{"skills": {path: [rule-id, ...]}, "manifests": {...}}. An allowlisted violation
passes; an entry that no longer matches a violation FAILS, so the list can only
shrink. With --allowlist-base REF, entries absent from the allowlist at REF also
fail (CI passes the PR base), so no later change can seed new entries. A REF
that does not resolve to a commit fails the gate; a REF whose tree has no
allowlist file yet passes the check (the change seeds it).

PyYAML is optional locally (a line-based parser covers the checks) and required
in CI: REQUIRE_YAML=1 turns its absence into a failure.

Usage: check-portability.py [repo-root] [--allowlist PATH] [--allowlist-base REF]
Exit:  0 = clean · 1 = violation(s) or stale allowlist entries · 2 = no skills found
"""
import json
import os
import re
import subprocess
import sys

SPEC_KEYS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
EXTRA_KEYS = {"argument-hint", "disable-model-invocation"}
SIZE_CAP = 8000
DESCRIPTION_CAP = 1024
NAME_CAP = 64
INSTRUCTIONS_LINE_CAP = 200
ALLOWLIST_SECTION = "skills"
TEXT_EXT = (".md", ".txt", ".sh", ".py", ".js", ".ts", ".json", ".yaml", ".yml", ".tsv", ".toml")

FRONTMATTER = re.compile(r"^---[ \t]*\n(.*?)\n---[ \t]*(?:\n|$)", re.DOTALL)
NAME_RE = re.compile(r"^ab-[a-z0-9]+(?:-[a-z0-9]+)*$")
# CommonMark fences: an opening run of 3+ backticks or tildes (then an info
# string) closes at the first line holding a run of the same character at least
# as long, then only whitespace, so a ```` block can quote a ``` block.
FENCE = re.compile(r"^[ \t]*((`|~)\2{2,})(?!\2)[^\n]*\n.*?^[ \t]*\1\2*[ \t]*$", re.DOTALL | re.MULTILINE)
PROSE_REF = re.compile(r"(?<![A-Za-z0-9_./-])ab-[a-z0-9]+(?:-[a-z0-9]+)*")

# R8: host substitutions and variables that tie a skill to one tool.
BANNED = [
    (re.compile(r"\$ARGUMENTS\b"), "$ARGUMENTS is Claude Code argument substitution"),
    (re.compile(r"\$\{?(?:CLAUDE_PLUGIN_ROOT|CLAUDE_PLUGIN_DATA|CLAUDE_SKILL_DIR|CLAUDE_PROJECT_DIR"
                r"|CLAUDE_SESSION_ID|PLUGIN_ROOT)\b\}?"),
     "host path/session variable; locate files from the skill's own directory"),
    (re.compile(r"(?:^|[\s(])!`[^`\n]+`"), "load-time !`command` pre-resolution is Claude Code only"),
]
# R8: paths out of the skill. Markdown links and backticked paths only: shell
# examples in fences that cd around a user's project are not skill paths.
LINK_UP = re.compile(r"\]\((?:\./)?\.\./")
TICK_UP = re.compile(r"`(?:\./)?\.\./[^`\s]*`")
OTHER_SKILL_PATH = re.compile(r"(?<![A-Za-z0-9_-])skills/(ab-[a-z0-9-]+)/")

# KTD8 + Hermes skills_guard agent_config_mod (critical): an imperative or
# directive modify verb aimed at an agent instructions file, or a shell write into one.
_CONFIG_FILE = r"(?:AGENTS\.md|CLAUDE\.md|\.cursorrules|\.clinerules)"
_MODIFY_VERB = (r"(?:\bwrit(?:e|es|ing)\b|\bwritten\b|\bedit(?:s|ed|ing)?\b|\bmodif(?:y|ies|ied|ying|ication)s?\b"
                r"|\bupdat(?:e|es|ed|ing)\b|\bappend(?:s|ed|ing)?\b|\bprepend(?:s|ed|ing)?\b|\binject(?:s|ed|ing)?\b"
                r"|\boverwrit(?:e|es|ing)\b|\boverwritten\b|\breplac(?:e|es|ed|ing)\b|\balter(?:s|ed|ing)?\b"
                r"|\badd(?:s|ed|ing)\b)")
INSTRUCTION_WRITES = [
    re.compile(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*)?%s[^\n,]{0,80}?%s\b" % (_MODIFY_VERB, _CONFIG_FILE),
               re.IGNORECASE | re.MULTILINE),
    re.compile(r"(?:\byou\s+(?:must|should|need\s+to)\s+|\bplease\s+|\bmake\s+sure\s+(?:to\s+|you\s+)|\bbe\s+sure\s+to\s+)"
               r"%s[^\n,]{0,80}?%s\b" % (_MODIFY_VERB, _CONFIG_FILE), re.IGNORECASE),
    re.compile(r"(?:>>|[\w\"'`)\]]\s*>)\s*[~\w./-]*%s(?!\.?\w)" % _CONFIG_FILE),
    re.compile(r"\bsed\b[^\n]*\s(?:-[A-Za-z]*i[A-Za-z]*|--in-place)\b[^\n]*%s(?!\.?\w)" % _CONFIG_FILE),
    re.compile(r"\btee\s+(?:-a\s+)?[~\w./\"'-]*%s(?!\.?\w)" % _CONFIG_FILE),
    re.compile(r"\b(?:cp|mv)\s+[^\s|;&]+\s+[^\n|;&]{0,40}?%s(?!\.?\w)" % _CONFIG_FILE),
]

# Hermes. Mirrors NousResearch/hermes-agent tools/threat_patterns.py ("all" and
# "context" scopes, which BLOCK a context file such as AGENTS.md) and the critical
# findings of tools/skills_guard.py (which QUARANTINE a project skill), as of
# commit 73f7fc2 (2026-09-28). Re-check both files when Hermes changes; the local
# smoke test's Hermes discovery cell is the authoritative check.
_F = r"(?:\w+\s+){0,8}"
_SECRET_VAR = r"\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)S?\b"
_SHELL_ALT = r"(?:bash|sh|zsh|ksh|dash)"
_SHELLS = _SHELL_ALT + r"\b"
HERMES = [(re.compile(p, re.IGNORECASE), label) for p, label in [
    (r"ignore\s+%s(?:previous|all|above|prior)\s+%sinstructions" % (_F, _F), "instruction override"),
    (r"system\s+prompt\s+override", "system prompt override"),
    (r"disregard\s+%s(?:your|all|any)\s+%s(?:instructions|rules|guidelines)" % (_F, _F), "disregard rules"),
    (r"act\s+as\s+(?:if|though)\s+%syou\s+%s(?:have\s+no|don't\s+have)\s+%s(?:restrictions|limits|rules)" % (_F, _F, _F),
     "act without restrictions"),
    (r"<\s*div\s+style\s*=\s*[\"'][^>]{0,2048}display\s*:\s*none", "hidden div"),
    (r"translate\s+[^\n]{0,512}\s+into\s+\w+(?:[\s-]+\w+){0,2}\s+and\s+(?:execute|run|eval)\b", "translate and execute"),
    (r"do\s+not\s+%stell\s+%sthe\s+user" % (_F, _F), "deception (do not tell the user)"),
    (r"you\s+are\s+%snow\s+(?:a|an|the)\s+" % _F, "role hijack (you are now ...)"),
    (r"pretend\s+%s(?:you\s+are|to\s+be)\s+" % _F, "role pretend"),
    (r"output\s+%s(?:system|initial)\s+prompt" % _F, "system prompt leak"),
    (r"(?:respond|answer|reply)\s+without\s+%s(?:restrictions|limitations|filters|safety)" % _F, "remove filters"),
    (r"you\s+have\s+been\s+%s(?:updated|upgraded|patched)\s+to" % _F, "fake update"),
    (r"\bname\s+yourself\s+\w+", "identity override"),
    (r"register\s+(?:as\s+)?a?\s*node", "C2 vocabulary (register as a node)"),
    (r"(?:heartbeat|beacon|check[\s-]?in)\s+(?:to|with)\s+", "C2 vocabulary (heartbeat / check in with)"),
    (r"pull\s+(?:down\s+)?(?:new\s+)?task(?:ing|s)?\b", "C2 vocabulary (pull tasks)"),
    (r"connect\s+to\s+the\s+network\b", "C2 vocabulary (connect to the network)"),
    (r"you\s+must\s+(?:\w+\s+){0,3}(?:register|connect|report|beacon)\b", "forced action"),
    (r"only\s+use\s+one[\s-]?liners?\b", "anti-forensic (one-liners only)"),
    (r"never\s+%s(?:create|write)\s+%s(?:script|file)\s+%sdisk" % (_F, _F, _F), "anti-forensic (never write to disk)"),
    (r"unset\s+\w*(?:CLAUDE|CODEX|HERMES|AGENT|OPENAI|ANTHROPIC)\w*", "unsets agent runtime variables"),
    (r"\b(?:cobalt\s*strike|sliver|havoc|mythic|metasploit|brainworm)\b", "C2 framework name"),
    (r"\bc2\s+(?:server|channel|infrastructure|beacon)\b|\bcommand\s+and\s+control\b", "C2 vocabulary"),
    (r"curl\s+(?![^\n]*https?://(?:localhost|127\.0\.0\.1|\[::1\]))[^\n]*%s" % _SECRET_VAR, "curl with a secret variable"),
    (r"wget\s+[^\n]*%s" % _SECRET_VAR, "wget with a secret variable"),
    (r"cat\s+(?!>)[^\n]*(?:\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)", "reads a secrets file"),
    (r"curl\s+[^\n]*\|\s*%s" % _SHELLS, "curl piped to a shell"),
    (r"wget\s+[^\n]*-O\s*-\s*\|\s*%s" % _SHELLS, "wget piped to a shell"),
    (r"curl\s+[^\n]*\|\s*python", "curl piped to python"),
    (r"echo\s+[^\n]*\|\s*(?:%s|python|perl|ruby|node)" % _SHELLS, "echo piped to an interpreter"),
    (r"rm\s+-rf\s+/(?:(?!tmp(?:\b|/)|var/tmp(?:\b|/)|dev/shm(?:\b|/)|run(?:\b|/)))", "recursive delete from root"),
    (r"rm\s+(?:-[^\s]*)?r.*\$HOME|\brmdir\s+.*\$HOME", "recursive delete of $HOME"),
    (r">\s*/etc/", "overwrites /etc"),
    (r"\bmkfs\b", "formats a filesystem"),
    (r"\bdd\s+.*if=.*of=/dev/", "raw disk write"),
    (r"\bnc\s+-[lp]|ncat\s+-[lp]|\bsocat\b[^\n]*\b(?:tcp|udp|openssl|ssl|exec|system|pty|unix)[\w-]*:", "reverse shell listener"),
    (r"/bin/%s\s+-i\s+.*>/dev/tcp/" % _SHELL_ALT, "reverse shell via /dev/tcp"),
    (r"/etc/passwd|/etc/shadow", "system password files"),
    (r"xmrig|stratum\+tcp|monero|coinhive|cryptonight", "crypto mining"),
    (r"authorized_keys", "SSH authorized_keys"),
    (r"/etc/sudoers|visudo|NOPASSWD", "sudoers"),
    (r"setuid|setgid|cap_setuid|chmod\s+[u+]?s\b", "setuid/setgid"),
    (r"(?:>>|[\w\"'`)\]]\s*>)\s*[~\w./-]*\.(?:claude/settings|codex/config)[\w.]*", "shell write into another agent's config"),
    (r"-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----", "embedded private key"),
    (r"ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{80,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}"
     r"|sk-ant-[A-Za-z0-9_-]{90,}|\bsk-[A-Za-z0-9]{20,}", "token-shaped secret"),
    (r"\bDAN\s+mode\b|Do\s+Anything\s+Now|\bdeveloper\s+mode\b.*\benabled?\b", "jailbreak phrasing"),
]]
INVISIBLE = set("​‌‍⁠⁢⁣⁤﻿‪‫‬‭‮⁦⁧⁨⁩")
HTML_COMMENT = re.compile(r"<!--")

YAML_WARNED = []
_YAML = []
_READ_CACHE = {}


# ── small helpers ──────────────────────────────────────────────

def read(path):
    """File text, read once per run: several rules scan the same files."""
    key = os.path.abspath(path)
    if key not in _READ_CACHE:
        with open(path, encoding="utf-8") as fh:
            _READ_CACHE[key] = fh.read()
    return _READ_CACHE[key]


def rel(repo, path):
    return os.path.relpath(path, repo).replace(os.sep, "/")


def load_yaml():
    if not _YAML:
        mod = None
        if os.environ.get("PORTABILITY_FORCE_NO_YAML") != "1":   # tests simulate a missing PyYAML
            try:
                import yaml as mod
            except ImportError:
                mod = None
        _YAML.append(mod)
    return _YAML[0]


def parse_frontmatter(text):
    """(mapping or None, error or None). Falls back to a line parser without PyYAML."""
    m = FRONTMATTER.match(text.replace("\r\n", "\n"))
    if not m:
        return None, "no frontmatter block"
    block = m.group(1)
    yaml = load_yaml()
    if yaml is not None:
        try:
            data = yaml.safe_load(block)
        except yaml.YAMLError as exc:
            return None, "frontmatter is not valid YAML (%s)" % (str(exc).splitlines() or [exc.__class__.__name__])[0]
        if not isinstance(data, dict):
            return None, "frontmatter is not a key/value mapping"
        return data, None
    if not YAML_WARNED:
        YAML_WARNED.append(True)
    data, key = {}, None
    for line in block.split("\n"):
        top = re.match(r"^([A-Za-z0-9_-]+):[ \t]*(.*)$", line)
        if top:
            key, val = top.group(1), top.group(2).strip()
            data[key] = "" if re.fullmatch(r"[>|][0-9]*[+-]?", val) else val.strip("\"'")
            if data[key] == "":
                data[key] = {} if key == "metadata" else ""
        elif key and line[:1] in (" ", "\t") and line.strip():
            if isinstance(data[key], dict):
                sub = re.match(r"^\s+([A-Za-z0-9_.-]+):[ \t]*(.*)$", line)
                if sub:
                    data[key][sub.group(1)] = sub.group(2).strip().strip("\"'")
            else:
                data[key] = (data[key] + " " + line.strip()).strip()
    for k, v in list(data.items()):
        if v in ("true", "false"):
            data[k] = v == "true"
    return data, None


def strip_fences(text):
    return FENCE.sub(lambda m: "\n" * m.group(0).count("\n"), text)


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def slash_reference(names):
    """Compiled /name pattern for these skill names, longest first so a name
    that prefixes another cannot match early; None for no names."""
    if not names:
        return None
    alt = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(r"(?<![A-Za-z0-9_.~:-])/(%s)(?![A-Za-z0-9_-])" % alt)


# ── inventory ──────────────────────────────────────────────────

def skill_dirs(repo):
    root = os.path.join(repo, "skills")
    if not os.path.isdir(root):
        return []
    return sorted(os.path.join(root, d) for d in os.listdir(root)
                  if os.path.isfile(os.path.join(root, d, "SKILL.md")))


def skill_files(skill_dir, exts=TEXT_EXT, include_assets=True):
    for root, dirs, files in os.walk(skill_dir):
        dirs[:] = sorted(d for d in dirs if d not in (".git", "node_modules", "__pycache__"))
        if not include_assets and os.path.relpath(root, skill_dir).split(os.sep)[0] == "assets":
            continue
        for name in sorted(files):
            if name.endswith(exts) or name == "SKILL.md":
                yield os.path.join(root, name)


def prose_files(skill_dir):
    """Markdown the agent reads as instructions: everything but assets/."""
    return [p for p in skill_files(skill_dir, (".md",), include_assets=False)]


def instruction_files(repo):
    """The root instructions file and the template ones a scaffold ships."""
    cands = ["AGENTS.md", "skills/ab-project-start/assets/AGENTS.md", "skills/ab-project-start/assets/CLAUDE.md"]
    out = []
    for c in cands:
        p = os.path.join(repo, c)
        if os.path.isfile(p) and not os.path.islink(p):
            out.append(p)
    return out


# ── rules ──────────────────────────────────────────────────────

def check_frontmatter(skill_dir, add):
    path = os.path.join(skill_dir, "SKILL.md")
    text = read(path)
    data, err = parse_frontmatter(text)
    if err:
        add(path, "frontmatter", err)
        return {}
    for key in sorted(data):
        if key in ("effort", "model"):
            add(path, "frontmatter", "key '%s' prescribes a %s; the user's session choice rules (R12)" % (key, key))
        elif key not in SPEC_KEYS | EXTRA_KEYS:
            add(path, "frontmatter", "key '%s' is outside the agentskills spec and the allowlist (%s)"
                % (key, ", ".join(sorted(EXTRA_KEYS))))
    name = data.get("name")
    dirname = os.path.basename(skill_dir)
    if not isinstance(name, str) or not name:
        add(path, "name", "frontmatter has no name")
    else:
        if len(name) > NAME_CAP:
            add(path, "name", "name is %d characters (cap %d)" % (len(name), NAME_CAP))
        if not name.startswith("ab-"):
            add(path, "name", "name '%s' lacks the ab- prefix (R9)" % name)
        elif not NAME_RE.match(name):
            add(path, "name", "name '%s' must be lowercase a-z, 0-9 and single hyphens" % name)
        if name != dirname:
            add(path, "name", "name '%s' does not match its directory '%s'" % (name, dirname))
    desc = data.get("description")
    if not isinstance(desc, str) or not desc.strip():
        add(path, "description", "description is missing or empty")
    elif len(desc) > DESCRIPTION_CAP:
        add(path, "description", "description is %d characters (cap %d)" % (len(desc), DESCRIPTION_CAP))
    size = len(text.replace("\r\n", "\n").encode("utf-8"))
    if size > SIZE_CAP:
        add(path, "size", "SKILL.md is %d bytes, frontmatter included (cap %d)" % (size, SIZE_CAP))
    return data


def check_prompt_frontmatter(skill_dir, add):
    agents = os.path.join(skill_dir, "references", "agents")
    if not os.path.isdir(agents):
        return
    for name in sorted(os.listdir(agents)):
        p = os.path.join(agents, name)
        if name.endswith(".md") and FRONTMATTER.match(read(p).replace("\r\n", "\n")):
            add(p, "frontmatter", "prompt files carry no frontmatter (KTD2)")


def check_text_rules(skill_dir, slash, add):
    own = os.path.basename(skill_dir)
    for path in skill_files(skill_dir, include_assets=False):
        text = read(path)
        for pat, why in BANNED:
            m = pat.search(text)
            if m:
                add(path, "banned-token", "line %d: %s (%s)" % (line_of(text, m.start()), m.group(0).strip(), why))
        if not path.endswith(".md"):
            continue
        prose = strip_fences(text)
        for pat in (LINK_UP, TICK_UP):
            m = pat.search(prose)
            if m:
                add(path, "path-escape", "line %d: %s leaves the skill directory" % (line_of(prose, m.start()), m.group(0)))
        for m in OTHER_SKILL_PATH.finditer(prose):
            if m.group(1) != own:
                add(path, "path-escape", "line %d: skills/%s/ is another skill's directory; name the skill in prose"
                    % (line_of(prose, m.start()), m.group(1)))
                break
        if slash:
            m = slash.search(text)
            if m:
                add(path, "slash-ref", "line %d: /%s; refer to skills in prose, e.g. the `%s` skill (KTD4)"
                    % (line_of(text, m.start()), m.group(1), m.group(1)))
        for pat in INSTRUCTION_WRITES:
            m = pat.search(text)
            if m:
                add(path, "instructions-write", "line %d: '%s' tells the agent to modify an instructions file; "
                    "name the project instructions file instead (KTD8, Hermes quarantine)"
                    % (line_of(text, m.start()), m.group(0).strip()[:70]))
                break


def hermes_findings(text):
    found = []
    for ch in sorted(set(text) & INVISIBLE):
        found.append((line_of(text, text.index(ch)), "invisible character U+%04X" % ord(ch)))
    for pat, label in HERMES:
        m = pat.search(text)
        if m:
            found.append((line_of(text, m.start()), label))
    return found


def check_hermes(paths, add):
    for path in paths:
        text = read(path)
        for line, label in hermes_findings(text):
            add(path, "hermes-pattern", "line %d: %s — Hermes blocks or quarantines this file" % (line, label))
        if path.endswith(".md"):
            m = HTML_COMMENT.search(text)
            if m:
                add(path, "html-comment", "line %d: HTML comment; Hermes drops a context file with one (KTD8)"
                    % line_of(text, m.start()))


def check_instruction_length(repo, add):
    for path in instruction_files(repo):
        if os.path.basename(path) != "AGENTS.md":
            continue
        n = len(read(path).splitlines())
        if n > INSTRUCTIONS_LINE_CAP:
            add(path, "instructions-length", "%d lines (cap %d, R15)" % (n, INSTRUCTIONS_LINE_CAP))


def check_stray_skill_md(repo, add):
    skills_root = os.path.join(repo, "skills")
    for root, dirs, files in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules")]
        if "SKILL.md" in files:
            path = os.path.join(root, "SKILL.md")
            if os.path.dirname(os.path.dirname(path)) != skills_root:
                add(path, "stray-skill-md", "SKILL.md outside skills/<name>/ would install as a skill (KTD1); "
                    "name fixtures SKILL.fixture.md")


def check_shared(repo, add):
    """Snippet and shared-file copies, checked by sync-shared.py's own --check logic."""
    import importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    spec = importlib.util.spec_from_file_location("sync_shared", os.path.join(here, "sync-shared.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for path, rule, msg in mod.find_drift(repo):
        add(path, rule, msg)


def openai_implicit_off(skill_dir):
    p = os.path.join(skill_dir, "agents", "openai.yaml")
    if not os.path.isfile(p):
        return None
    text = read(p)
    yaml = load_yaml()
    if yaml is not None:
        try:
            data = yaml.safe_load(text) or {}
            return (data.get("policy") or {}).get("allow_implicit_invocation") is False
        except yaml.YAMLError:
            return False
    return bool(re.search(r"^\s+allow_implicit_invocation:\s*false\s*$", text, re.MULTILINE))


def check_manual_only(dirs, fm_by_skill, add):
    manual = set()
    for skill_dir in dirs:
        name = os.path.basename(skill_dir)
        flag = fm_by_skill.get(name, {}).get("disable-model-invocation") is True
        off = openai_implicit_off(skill_dir)
        path = os.path.join(skill_dir, "SKILL.md")
        if flag and off is not True:
            add(path, "manual-only", "manual-only skill needs agents/openai.yaml with "
                "policy.allow_implicit_invocation: false (KTD12)")
        if off is True and not flag:
            add(path, "manual-only", "agents/openai.yaml turns implicit invocation off, but the skill lacks "
                "disable-model-invocation: true")
        if flag or off:
            manual.add(name)
    if not manual:
        return
    for skill_dir in dirs:
        own = os.path.basename(skill_dir)
        for path in prose_files(skill_dir):
            refs = {m.group(0) for m in PROSE_REF.finditer(read(path))}
            for name in sorted((refs & manual) - {own}):
                add(path, "manual-only", "references manual-only skill %s; manual-only skills are hidden from "
                    "other skills on Claude Code, Codex and Grok (KTD12)" % name)


# ── driver ─────────────────────────────────────────────────────

def collect(repo):
    """All violations as {(rel_path, rule): [messages]}."""
    found = {}
    _READ_CACHE.clear()

    def add(path, rule, msg):
        found.setdefault((rel(repo, path), rule), []).append(msg)

    dirs = skill_dirs(repo)
    names = [os.path.basename(d) for d in dirs]
    old_names = []
    tsv = os.path.join(repo, "docs", "upgrade", "v4-skill-names.tsv")
    if os.path.isfile(tsv):
        old_names = [ln.split("\t")[0] for ln in read(tsv).splitlines()[1:] if ln.strip()]
    slash = slash_reference(names + old_names)
    fm_by_skill = {}
    for d in dirs:
        fm_by_skill[os.path.basename(d)] = check_frontmatter(d, add)
        check_prompt_frontmatter(d, add)
        check_text_rules(d, slash, add)
        check_hermes(list(skill_files(d)), add)
    check_hermes(instruction_files(repo), add)
    check_instruction_length(repo, add)
    check_stray_skill_md(repo, add)
    check_shared(repo, add)
    check_manual_only(dirs, fm_by_skill, add)
    return found, len(dirs)


def load_allowlist(path, section):
    if not path or not os.path.isfile(path):
        return set()
    data = json.loads(read(path))
    return {(p, r) for p, rules in (data.get(section) or {}).items() for r in rules}


class BaseRefError(Exception):
    """--allowlist-base cannot be read: the ref names no commit, or git cannot run."""


def base_allowlist(repo, ref, rel_path, section):
    """Allowlist entries at ref, or None when ref has no allowlist file (the base
    predates it, so there is nothing to compare). Raises BaseRefError when ref does
    not resolve to a commit: a typo or an unfetched ref must not skip the check."""
    def git(*args):
        try:
            return subprocess.run(["git", "-C", repo] + list(args), capture_output=True, text=True)
        except OSError as exc:
            raise BaseRefError("git cannot run (%s)" % exc)

    commit = git("rev-parse", "--verify", "--quiet", "%s^{commit}" % ref)
    if commit.returncode != 0:
        detail = (commit.stderr.strip().splitlines() or [""])[0]
        raise BaseRefError("does not resolve to a commit%s; fetch it (CI checks out with fetch-depth: 0) "
                           "or fix the name" % (" (%s)" % detail if detail else ""))
    blob = "%s:%s" % (commit.stdout.strip(), rel_path)
    if git("cat-file", "-e", blob).returncode != 0:
        return None
    shown = git("show", blob)
    if shown.returncode != 0:
        raise BaseRefError("git show %s failed (%s)" % (blob, shown.stderr.strip()))
    data = json.loads(shown.stdout)
    return {(p, r) for p, rules in (data.get(section) or {}).items() for r in rules}


def parse_args(argv, script_file):
    """(repo, allowlist path, base ref) from [repo-root] [--allowlist PATH] [--allowlist-base REF]."""
    args, allowlist, base_ref = [], None, None
    it = iter(argv)
    for a in it:
        if a == "--allowlist":
            allowlist = next(it)
        elif a == "--allowlist-base":
            base_ref = next(it)
        else:
            args.append(a)
    script_dir = os.path.dirname(os.path.abspath(script_file))
    repo = os.path.abspath(args[0]) if args else os.path.dirname(script_dir)
    return repo, allowlist or os.path.join(repo, "scripts", "portability-allowlist.json"), base_ref


def allowlist_status(repo, found, allowlist, section, base_ref):
    """(failures, stale, grew, held): violations not allowlisted, allowlist entries
    with no violation, entries missing at base_ref, and allowlisted violations.
    grew is a BaseRefError instead when base_ref cannot be read; it is truthy, so a
    gate that fails on a non-empty grew fails on it too."""
    allowed = load_allowlist(allowlist, section)
    failures = sorted(k for k in found if k not in allowed)
    stale = sorted(allowed - set(found))
    grew = []
    if base_ref:
        try:
            base = base_allowlist(repo, base_ref, rel(repo, allowlist), section)
        except BaseRefError as exc:
            base, grew = None, exc
        if base is not None:
            grew = sorted(allowed - base)
    held = sorted(k for k in found if k in allowed)
    return failures, stale, grew, held


def print_findings(found, status, base_ref):
    failures, stale, grew, held = status
    if failures:
        print("\n  FAIL (%d):" % len(failures))
        for key in failures:
            for msg in found[key]:
                print("    %s: [%s] %s" % (key[0], key[1], msg))
    if stale:
        print("\n  FAIL — allowlist entries that no longer match a violation (remove them; the list only shrinks):")
        for p, r in stale:
            print("    %s: [%s]" % (p, r))
    if isinstance(grew, BaseRefError):
        print("\n  FAIL — --allowlist-base %s: %s. The shrink-only check cannot run." % (base_ref, grew))
    elif grew:
        print("\n  FAIL — allowlist entries added since %s (fix the violation instead of allowlisting it):" % base_ref)
        for p, r in grew:
            print("    %s: [%s]" % (p, r))
    if held:
        print("\n  Allowlisted (%d entries, drained by later units):" % len(held))
        for p, r in held:
            print("    %s: [%s]" % (p, r))


def main(argv):
    repo, allowlist, base_ref = parse_args(argv, __file__)
    found, count = collect(repo)
    if count == 0:
        print("check-portability: no skills under %s/skills — refusing to pass vacuously" % repo)
        return 2
    status = allowlist_status(repo, found, allowlist, ALLOWLIST_SECTION, base_ref)
    print("Portability gate — %d skills" % count)
    yaml_required = bool(YAML_WARNED) and os.environ.get("REQUIRE_YAML") == "1"
    if YAML_WARNED:
        if yaml_required:
            print("\n  FAIL: PyYAML is not installed and REQUIRE_YAML=1 — frontmatter cannot be fully parsed")
        else:
            print("\n  WARN: PyYAML not installed — frontmatter checked with a line parser (CI uses PyYAML)")
    print_findings(found, status, base_ref)
    bad = status[0] or status[1] or status[2] or yaml_required
    if not bad:
        print("\n  OK — no violations beyond the allowlist.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
