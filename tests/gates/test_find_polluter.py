"""ab-systematic-debugging's find-polluter.sh bisects a fixture tree with a stub npm.

Runs the script in a temporary project whose PATH leads with a fake npm, so
the real one never starts: two matching test files, a pattern that matches
none, and a stub that plants the pollution file so the first test is named.
"""
import os
import shutil
import stat
import subprocess
import tempfile
import unittest

from gate_helpers import REPO, write

SCRIPT = os.path.join(REPO, "skills", "ab-systematic-debugging", "scripts", "find-polluter.sh")
# Exits 0 like a passing suite; plants the pollution file when asked to, so a run can name a polluter.
FAKE_NPM = '#!/bin/sh\n[ -z "$FAKE_NPM_POLLUTE" ] || touch "$FAKE_NPM_POLLUTE"\nexit 0\n'


class FindPolluter(unittest.TestCase):
    def setUp(self):
        self.project = tempfile.mkdtemp(prefix="ab-polluter-")
        self.addCleanup(shutil.rmtree, self.project, ignore_errors=True)
        npm = write(self.project, os.path.join("fake-bin", "npm"), FAKE_NPM)
        os.chmod(npm, os.stat(npm).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        self.env = dict(os.environ, PATH=os.path.dirname(npm) + os.pathsep + os.environ.get("PATH", ""))
        for rel in ("src/a/x.test.ts", "src/b/y.test.ts"):
            write(self.project, rel, "")

    def run_script(self, check, pattern, **env):
        return subprocess.run(["bash", SCRIPT, check, pattern], cwd=self.project, env=dict(self.env, **env),
                              capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)

    def test_clean_tree_runs_every_test_and_exits_0(self):
        result = self.run_script(".git", "src/**/*.test.ts")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Found 2 test files", result.stdout)
        self.assertIn("./src/a/x.test.ts", result.stdout)
        self.assertIn("./src/b/y.test.ts", result.stdout)

    def test_pattern_matching_nothing_exits_2(self):
        result = self.run_script(".git", "lib/**/*.spec.ts")
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("No test files match", result.stderr)

    def test_pollution_after_a_test_names_it_and_exits_1(self):
        result = self.run_script(".git", "src/**/*.test.ts", FAKE_NPM_POLLUTE=".git")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("FOUND POLLUTER", result.stdout)
        self.assertIn("Test: ./src/a/x.test.ts", result.stdout)
        self.assertNotIn("[2/2]", result.stdout, "the bisection stops at the first polluter")


if __name__ == "__main__":
    unittest.main()
