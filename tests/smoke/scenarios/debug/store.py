"""A small JSON-backed notes store."""

import json
import os
from dataclasses import asdict, dataclass


@dataclass
class Note:
    id: int
    title: str
    body: str


class NoteStore:
    """Notes kept in one JSON file; every change is written back at once."""

    def __init__(self, path):
        self.path = path
        self._notes = self._load()

    def _load(self):
        if not os.path.exists(self.path):
            return []
        with open(self.path, encoding="utf-8") as fh:
            return [Note(**item) for item in json.load(fh)]

    def save(self):
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump([asdict(note) for note in self._notes], fh, indent=2)

    def add(self, title, body):
        next_id = max((note.id for note in self._notes), default=0) + 1
        note = Note(id=next_id, title=title, body=body)
        self._notes.append(note)
        self.save()
        return note

    def list(self):
        return list(self._notes)

    def search(self, query):
        """Notes whose title or body contains the query."""
        return [note for note in self._notes if query in note.title or query in note.body]

    def export(self, fmt="json"):
        if fmt == "json":
            return json.dumps([asdict(note) for note in self._notes], indent=2)
        if fmt == "md":
            lines = []
            for note in self._notes:
                lines.append("## %d. %s" % (note.id, note.title))
                lines.append("")
                lines.append(note.body)
                lines.append("")
            return "\n".join(lines)
        raise ValueError("unknown export format: %s" % fmt)
