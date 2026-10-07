"""Shared helpers for the gate tests: build a throwaway repository and run a gate on it.

Skill fixtures are stored as SKILL.fixture.md so the installable tree never holds
a stray SKILL.md (KTD1); build_repo() copies them into place as SKILL.md.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
FIXTURES = os.path.join(HERE, "fixtures")
SCRIPTS = os.path.join(REPO, "scripts")


def fixture(*parts):
    with open(os.path.join(FIXTURES, *parts), encoding="utf-8") as fh:
        return fh.read()


def write(root, rel_path, text):
    path = os.path.join(root, rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return path


def copy_fixture_skill(src_dir, dest_dir):
    """Copy a fixture skill directory, renaming SKILL.fixture.md to SKILL.md."""
    for root, _dirs, files in os.walk(src_dir):
        for name in files:
            src = os.path.join(root, name)
            rel = os.path.relpath(src, src_dir)
            if name == "SKILL.fixture.md":
                rel = os.path.join(os.path.dirname(rel), "SKILL.md")
            dest = os.path.join(dest_dir, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copyfile(src, dest)


class Repo:
    """A temporary repository holding the two fixture skills and nothing else."""

    def __init__(self):
        self.root = tempfile.mkdtemp(prefix="ab-gate-")
        copy_fixture_skill(os.path.join(FIXTURES, "skill"), os.path.join(self.root, "skills", "ab-fixture"))
        copy_fixture_skill(os.path.join(FIXTURES, "helper"), os.path.join(self.root, "skills", "ab-helper"))

    def path(self, rel_path):
        return os.path.join(self.root, rel_path)

    def write(self, rel_path, text):
        return write(self.root, rel_path, text)

    def read(self, rel_path):
        with open(self.path(rel_path), encoding="utf-8") as fh:
            return fh.read()

    def edit(self, rel_path, old, new):
        text = self.read(rel_path)
        assert old in text, (rel_path, old)
        self.write(rel_path, text.replace(old, new, 1))

    def allowlist(self, skills=None, manifests=None):
        self.write("scripts/portability-allowlist.json",
                   json.dumps({"skills": skills or {}, "manifests": manifests or {}}, indent=2))

    def registry(self, data):
        self.write("scripts/prompt-owners.json", json.dumps(data, indent=2))

    def cleanup(self):
        shutil.rmtree(self.root, ignore_errors=True)


def run_gate(script, repo_root, *args, env=None):
    """(exit code, combined output) of scripts/<script> run against repo_root."""
    full_env = dict(os.environ)
    full_env.pop("REQUIRE_YAML", None)
    full_env.pop("PORTABILITY_FORCE_NO_YAML", None)
    full_env.update(env or {})
    result = subprocess.run([sys.executable, os.path.join(SCRIPTS, script), repo_root] + list(args),
                            capture_output=True, text=True, env=full_env)
    return result.returncode, result.stdout + result.stderr
