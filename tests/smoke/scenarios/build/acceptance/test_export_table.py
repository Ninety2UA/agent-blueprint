"""Hidden acceptance test for the build cell: `notes export --format table` lists every note.

The harness copies it into tests/ after the run and runs it in a venv built from the project's
declared dependencies, so `tabulate` must be declared there and importable.
"""
import os
import subprocess
import sys
import tempfile
import unittest

import tabulate  # noqa: F401  (the feature's dependency, declared by the run)

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")


class ExportTable(unittest.TestCase):
    def run_cli(self, store, *args):
        env = dict(os.environ)
        env["PYTHONPATH"] = SRC + os.pathsep + env.get("PYTHONPATH", "")
        result = subprocess.run([sys.executable, "-m", "notes", "--store", store] + list(args),
                                capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_table_lists_both_titles(self):
        with tempfile.TemporaryDirectory() as d:
            store = os.path.join(d, "notes.json")
            self.run_cli(store, "add", "Harbor plan", "ship on Monday")
            self.run_cli(store, "add", "Groceries", "milk, eggs")
            out = self.run_cli(store, "export", "--format", "table")
        self.assertIn("Harbor plan", out)
        self.assertIn("Groceries", out)
        self.assertRegex(out, r"[-+|=]{3,}", "no table rule in the output")
        self.assertNotIn('"title"', out, "the table format must not print JSON")


if __name__ == "__main__":
    unittest.main()
