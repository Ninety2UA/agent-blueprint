import contextlib
import io
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from notes.cli import main  # noqa: E402


class ExportTableTests(unittest.TestCase):
    def test_table_lists_titles(self):
        store = os.path.join(tempfile.mkdtemp(), "notes.json")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            main(["--store", store, "add", "Groceries", "milk, eggs"])
            main(["--store", store, "export", "--format", "table"])
        self.assertIn("Groceries", out.getvalue())


if __name__ == "__main__":
    unittest.main()
