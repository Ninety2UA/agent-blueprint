"""pi_source.py reads Pi package sources as Pi 0.73.1 does."""
import importlib.util
import sys
import unittest

try:
    from .install_harness import GITHUB, PI_PARSER, PI_SOURCE
except ImportError:
    from install_harness import GITHUB, PI_PARSER, PI_SOURCE

_GITHUB = ("github.com", GITHUB)
# (source, (host, path, ref)) as Pi 0.73.1's parseGitUrl (dist/utils/git.js) returns them; None where it
# returns null. Pi's own parser gave every row: rerun it over PARSE_CASES when Pi changes its rules.
PARSE_CASES = (
    (PI_SOURCE, (*_GITHUB, None)),
    (PI_SOURCE + "@v4.0.2", (*_GITHUB, "v4.0.2")),
    (PI_SOURCE + "#v4.0.2", (*_GITHUB, "v4.0.2")),
    ("git:https://github.com/" + GITHUB + "@v4.0.2", (*_GITHUB, "v4.0.2")),
    ("git:https://github.com/" + GITHUB + ".git", (*_GITHUB, None)),
    ("git:http://github.com/" + GITHUB, (*_GITHUB, None)),
    ("git:ssh://git@github.com/" + GITHUB + "@v1", (*_GITHUB, "v1")),
    ("git:git@github.com:" + GITHUB, (*_GITHUB, None)),
    ("git:git@github.com:" + GITHUB + "@v1", (*_GITHUB, "v1")),
    ("git:git@github.com:" + GITHUB + ".git", (*_GITHUB, None)),
    ("git:git://github.com/" + GITHUB, (*_GITHUB, None)),
    ("git://github.com/" + GITHUB, (*_GITHUB, None)),
    ("https://github.com/" + GITHUB, (*_GITHUB, None)),
    ("https://github.com/" + GITHUB + "@v4.0.2", (*_GITHUB, "v4.0.2")),
    ("https://github.com/" + GITHUB + ".git#v1", (*_GITHUB, "v1")),
    ("ssh://git@github.com/" + GITHUB, (*_GITHUB, None)),
    ("http://GitLab.Example.com/a/b", ("gitlab.example.com", "a/b", None)),
    ("git:GitHub.com/ninety2ua/Agent-Blueprint", ("github.com", "ninety2ua/Agent-Blueprint", None)),
    ("git:gitlab.example.com/a/b/c@v2", ("gitlab.example.com", "a/b/c", "v2")),
    ("git:gitlab.example.com/a/b/c.git", ("gitlab.example.com", "a/b/c", None)),
    ("git:https://user@gitlab.example.com:8443/a/b.git@v3", ("gitlab.example.com", "a/b", "v3")),
    ("ssh://git@gitlab.example.com:2222/a/b", ("gitlab.example.com", "a/b", None)),
    ("git:git@gitlab.example.com:a/b@v2", ("gitlab.example.com", "a/b", "v2")),
    ("git:localhost/a/b", ("localhost", "a/b", None)),
    ("git:github.com/x/y.git@v1", ("github.com", "x/y", "v1")),
    ("git:github.com/x/y@", ("github.com", "x/y@", None)),
    ("git:https://github.com/x/y/", ("github.com", "x/y", None)),
    ("git: github.com/x/y ", ("github.com", "x/y", None)),
    ("  git:github.com/x/y", ("github.com", "x/y", None)),
    ("git:git@github.com:/x/y", ("github.com", "x/y", None)),
    # Elsewhere than GitHub a trailing slash stays, and .git leaves only from the very end.
    ("git:https://git.example.com/a/b.git/", ("git.example.com", "a/b.git/", None)),
    ("git:git.example.com/a/b/", ("git.example.com", "a/b/", None)),
    ("git:git@git.example.com:a/b.git/", ("git.example.com", "a/b.git/", None)),
    # A URL with @ref is rebuilt without the ref, which drops one trailing slash.
    ("git:https://git.example.com/a/b.git/@v1", ("git.example.com", "a/b", "v1")),
    # GitHub browse URLs: /tree/<ref> pins; /blob/ and /commit/ are not GitHub forms to Pi.
    ("git:https://github.com/" + GITHUB + "/tree/main", (*_GITHUB, "main")),
    ("https://github.com/x/y/tree/v1.0/docs", ("github.com", "x/y", "v1.0")),
    ("git:github.com/x/y/tree/main", ("github.com", "x/y", "main")),
    ("git:git@github.com:x/y/tree/main@v1", ("github.com", "x/y", "main")),
    ("git:https://github.com/x/y/blob/main", ("github.com", "x/y/blob/main", None)),
    ("git:https://github.com/x/y/commit/abc123", ("github.com", "x/y/commit/abc123", None)),
    # www.github.com is github.com, and github.com:owner/repo is a GitHub source.
    ("git:www.github.com/" + GITHUB, (*_GITHUB, None)),
    ("git:https://www.github.com/x/y@v1", ("github.com", "x/y", "v1")),
    ("git:git@www.github.com:x/y", ("github.com", "x/y", None)),
    ("git:github.com:" + GITHUB, (*_GITHUB, None)),
    ("git:github.com:x/y@v1", ("github.com", "x/y", "v1")),
    ("git:github.com:x/y/z", ("github.com:x", "y/z", None)),
    # The host keeps its case where Pi's URL parser keeps it.
    ("ssh://git@GitLab.Example.com/a/b", ("GitLab.Example.com", "a/b", None)),
    ("git:git@GitLab.Example.com:a/b", ("GitLab.Example.com", "a/b", None)),
    # #ref is a ref only for the hosts Pi knows.
    ("git:https://gitlab.example.com/a/b#v1", ("gitlab.example.com", "a/b", None)),
    ("git:https://gitlab.com/a/b#v1", ("gitlab.com", "a/b", "v1")),
    ("git:https://www.gitlab.com/a/b", ("gitlab.com", "a/b", None)),
    ("git:example/x/y", None),
    # Pi counts git:// as its git: prefix, so an unprefixed git:// URL reads only GitHub.
    ("git://git.example.com/a/b", None),
    ("git@github.com:" + GITHUB, None),
    ("npm:agent-blueprint", None),
    ("./local", None),
    ("/abs/agent-blueprint", None),
    ("../agent-blueprint", None),
)
# (source, local) as Pi's parseSource (dist/core/package-manager.js) reads them: every source that is
# neither npm: nor git is a local path.
LOCAL_CASES = (
    ("./local", True), ("/abs/agent-blueprint", True), ("checkouts/agent-blueprint", True),
    ("git@github.com:x/y", True), ("http://github.com", True), ("git://git.example.com/a/b", True),
    ("HTTPS://github.com/x/y", True), ("npm:agent-blueprint", False), (PI_SOURCE, False),
    ("https://github.com/x/y", False), ("git:github.com:x/y", False),
)


def load_parser():
    spec = importlib.util.spec_from_file_location("pi_source", PI_PARSER)
    module = importlib.util.module_from_spec(spec)
    writes_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True   # the gates read every file under skills/ as text
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = writes_bytecode
    return module


class PiSource(unittest.TestCase):
    def test_pi_source_parses_like_pi(self):
        module = load_parser()
        for source, expected in PARSE_CASES:
            with self.subTest(source=source):
                parsed = module.parse(source)
                self.assertEqual(None if parsed is None else (parsed.host, parsed.path, parsed.ref), expected)
                if parsed is not None:
                    self.assertEqual(parsed.pinned, expected[2] is not None)

    def test_local_sources_are_what_pi_reads_as_paths(self):
        module = load_parser()
        for source, local in LOCAL_CASES:
            with self.subTest(source=source):
                self.assertIs(module.is_local(source), local)
        self.assertIs(module.is_local(None), False)


if __name__ == "__main__":
    unittest.main()
