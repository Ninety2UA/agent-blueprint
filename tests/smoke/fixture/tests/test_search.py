import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from notes.store import NoteStore  # noqa: E402


class SearchTests(unittest.TestCase):
    def setUp(self):
        self.store = NoteStore(os.path.join(tempfile.mkdtemp(), "notes.json"))
        self.store.add("Harbor plan", "Ship the release on Monday")
        self.store.add("Groceries", "milk, eggs")

    def test_search_matches_body(self):
        self.assertEqual([note.title for note in self.store.search("milk")], ["Groceries"])

    def test_search_is_case_insensitive(self):
        self.assertEqual([note.title for note in self.store.search("harbor")], ["Harbor plan"])
        self.assertEqual([note.title for note in self.store.search("MONDAY")], ["Harbor plan"])

    def test_search_without_a_match_is_empty(self):
        self.assertEqual(self.store.search("tuesday"), [])


if __name__ == "__main__":
    unittest.main()
