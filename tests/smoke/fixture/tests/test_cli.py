import contextlib
import io
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from notes.cli import main  # noqa: E402


class CliTests(unittest.TestCase):
    def setUp(self):
        self.store = os.path.join(tempfile.mkdtemp(), "notes.json")

    def run_cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(["--store", self.store] + list(args))
        self.assertEqual(code, 0)
        return out.getvalue()

    def test_add_then_list(self):
        self.run_cli("add", "Groceries", "milk, eggs")
        self.assertIn("1\tGroceries\tmilk, eggs", self.run_cli("list"))

    def test_search_prints_matching_notes_only(self):
        self.run_cli("add", "Groceries", "milk, eggs")
        self.run_cli("add", "Ideas", "a notes app")
        out = self.run_cli("search", "notes")
        self.assertIn("Ideas", out)
        self.assertNotIn("Groceries", out)

    def test_export_md(self):
        self.run_cli("add", "Groceries", "milk, eggs")
        self.assertIn("## 1. Groceries", self.run_cli("export", "--format", "md"))


if __name__ == "__main__":
    unittest.main()
