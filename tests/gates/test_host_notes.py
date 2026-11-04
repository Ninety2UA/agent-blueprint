"""tests/smoke/host-notes.py opens each CLI's smoke section with the install record, never Eve's.

Eve is deployed, not installed (v4.2.0 checklist, decision 3), so the line saying the install
record "shows this tool installing Agent Blueprint by its own route" stays out of eve.md while
the eight CLI notes keep it.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from gate_helpers import REPO

SCRIPT = os.path.join(REPO, "tests", "smoke", "host-notes.py")
NOTES = ["claude-code.md", "codex.md", "antigravity.md", "grok-build.md", "pi.md", "cursor-cli.md", "hermes.md",
         "amp.md", "eve.md"]
INSTALL_LINE = "installing Agent Blueprint by its own route"


class HostNotes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="ab-host-notes-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        releases = os.path.join(self.tmp, "docs", "releases")
        hosts = os.path.join(self.tmp, "docs", "hosts")
        os.makedirs(releases)
        os.makedirs(hosts)
        with open(os.path.join(releases, "v9.9.9-installs.md"), "w", encoding="utf-8") as fh:
            fh.write("# Installs\n")
        cell = {"state": "pass", "seconds": 1, "reason": "mock run", "date": "2026-11-04T00:00:00Z"}
        doc = {"release": "9.9.9", "hosts": {"claude": {"version": "1.0", "cells": {"discovery": cell}},
                                             "eve": {"version": "eve 0.86.0", "cells": {"discovery": cell}}}}
        self.json = os.path.join(releases, "v9.9.9-smoke.json")
        with open(self.json, "w", encoding="utf-8") as fh:
            json.dump(doc, fh)
        for note in NOTES:
            with open(os.path.join(hosts, note), "w", encoding="utf-8") as fh:
                fh.write("# Note\n\n## Smoke status\n\nold\n")

    def section(self, note):
        with open(os.path.join(self.tmp, "docs", "hosts", note), encoding="utf-8") as fh:
            return fh.read().split("## Smoke status\n", 1)[1]

    def test_the_install_line_is_left_out_of_eve_only(self):
        run = subprocess.run([sys.executable, SCRIPT, "--json", self.json], cwd=self.tmp,
                             capture_output=True, text=True, timeout=60)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
        eve = self.section("eve.md")
        self.assertNotIn(INSTALL_LINE, eve)
        self.assertNotIn("Install:", eve)
        self.assertIn("| `discovery` | pass |", eve)
        for note in NOTES[:-1]:
            self.assertIn(INSTALL_LINE, self.section(note), note)


if __name__ == "__main__":
    unittest.main()
