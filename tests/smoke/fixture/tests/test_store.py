import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from notes.store import NoteStore  # noqa: E402


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "notes.json")

    def test_add_assigns_increasing_ids(self):
        store = NoteStore(self.path)
        first = store.add("Groceries", "milk, eggs")
        second = store.add("Ideas", "a notes app")
        self.assertEqual((first.id, second.id), (1, 2))

    def test_notes_persist_across_instances(self):
        NoteStore(self.path).add("Groceries", "milk, eggs")
        titles = [note.title for note in NoteStore(self.path).list()]
        self.assertEqual(titles, ["Groceries"])

    def test_export_md_lists_every_title(self):
        store = NoteStore(self.path)
        store.add("Groceries", "milk, eggs")
        store.add("Ideas", "a notes app")
        text = store.export("md")
        self.assertIn("## 1. Groceries", text)
        self.assertIn("## 2. Ideas", text)


if __name__ == "__main__":
    unittest.main()
