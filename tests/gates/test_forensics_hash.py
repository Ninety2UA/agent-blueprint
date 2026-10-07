"""ab-forensics' hash block lands on the ship runner's state directory.

The runner, skills/ab-ship-pipeline/scripts/run.sh, keys its state on
REPO_HASH=$(printf '%s' "$REPO" | sha256_stdin | cut -c1-16) (line 164), where
sha256_stdin (lines 127-132) tries sha256sum, then shasum -a 256, then openssl
dgst -sha256. The skill's first bash block is run inside a temporary git
repository and must print the same sixteen hex characters as that recipe and
as hashlib, and say so on stderr, setting no hash, when no SHA-256 tool is on
the PATH.
"""
import hashlib
import os
import re
import shutil
import subprocess
import tempfile
import unittest

from gate_helpers import REPO, read

SKILL_MD = os.path.join(REPO, "skills", "ab-forensics", "SKILL.md")
RUN_SH = os.path.join(REPO, "skills", "ab-ship-pipeline", "scripts", "run.sh")
BASH = shutil.which("bash")
ALLOWED = ("git", "cut", "sed", "ls", "head")   # what the block needs besides a SHA-256 tool
RUNNER_HASH = "printf '%s' \"$REPO\" | sha256_stdin | cut -c1-16"


def hash_block():
    """The skill's first ```bash block."""
    return re.search(r"```bash\n(.*?)\n```", read(SKILL_MD), re.DOTALL).group(1)


def runner_recipe():
    """run.sh's sha256_stdin function, so the test runs the runner's own fallback chain."""
    return re.search(r"(?ms)^sha256_stdin\(\) \{\n.*?^\}$", read(RUN_SH)).group(0)


class ForensicsHash(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="ab-forensics-")
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.repo = os.path.join(self.root, "repo")
        os.makedirs(self.repo)
        subprocess.run(["git", "init", "-q", self.repo], check=True, timeout=60)
        self.state = os.path.join(self.root, "state")
        os.makedirs(self.state)
        self.toplevel = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=self.repo, capture_output=True,
                                       text=True, check=True, timeout=60).stdout.strip()

    def run_bash(self, script, path=None):
        env = dict(os.environ, XDG_STATE_HOME=self.state, HOME=self.root)
        if path is not None:
            env["PATH"] = path
        return subprocess.run([BASH, "-c", script], cwd=self.repo, env=env, capture_output=True, text=True, timeout=60)

    def restricted_path(self):
        """A directory holding only the ALLOWED tools, so no sha256sum, shasum or openssl resolves."""
        bin_dir = os.path.join(self.root, "bin")
        os.makedirs(bin_dir)
        for tool in ALLOWED:
            found = shutil.which(tool)
            if found is None:
                self.skipTest("%s is not installed" % tool)
            os.symlink(found, os.path.join(bin_dir, tool))
        return bin_dir

    def test_block_opens_with_the_toplevel_lookup(self):
        self.assertTrue(hash_block().startswith("repo=$(git rev-parse --show-toplevel)"))

    def test_runner_keys_its_state_on_the_cited_recipe(self):
        self.assertIn("REPO_HASH=$(%s)" % RUNNER_HASH, read(RUN_SH))

    def test_hash_equals_the_runner_recipe_and_hashlib(self):
        expected = hashlib.sha256(self.toplevel.encode()).hexdigest()[:16]
        skill = self.run_bash(hash_block() + "\nprintf '%s\\n' \"$hash\"\n")
        self.assertEqual(skill.returncode, 0, skill.stderr)
        self.assertEqual(skill.stdout.strip(), expected, "the block prints only the hash: the state dir is empty")
        runner = self.run_bash(runner_recipe() + "\nREPO=$(git rev-parse --show-toplevel)\n%s\n" % RUNNER_HASH)
        self.assertEqual(runner.returncode, 0, runner.stderr)
        self.assertEqual(runner.stdout.strip(), expected)

    def test_without_a_sha256_tool_the_block_says_so_and_sets_no_hash(self):
        result = self.run_bash(hash_block() + "\nprintf '%s\\n' \"$hash\"\n", path=self.restricted_path())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("no SHA-256 tool", result.stderr)
        self.assertEqual(result.stdout.strip(), "")


if __name__ == "__main__":
    unittest.main()
