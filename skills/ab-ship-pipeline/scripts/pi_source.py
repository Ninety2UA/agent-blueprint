"""pi_source.py: parse a Pi package source the way Pi 0.73.1 does (dist/utils/git.js).

install.sh and hosts.sh both load this file by its path, so the two read Pi's settings alike.

  parse(source) -> GitSource(host, path, ref, pinned), or None for a source that is not git
                   (npm:, a local path)

Pi's rules, from splitRef, parseGenericGitUrl and parseGitUrl:
  - With a git: prefix, every shorthand is accepted: host/path (the host has a dot or is
    localhost), https://, http://, ssh://, git://, and the scp form git@host:path.
  - Without the prefix, only an explicit protocol URL is: https://, http://, ssh://, git://.
  - A ref pins the package. It follows the path as @ref (in the scp form, the first @ after
    host:path), or comes as #ref. Pi splits #ref only for the hosts it knows (GitHub, GitLab,
    Bitbucket); it is split here for every host.
  - A trailing .git leaves the path. Pi clones a git package into <agent dir>/git/<host>/<path>.
  - The host is lowercased, as Pi does for every URL and for the hosts it knows; a shorthand with
    a capitalized custom host is the one spelling where Pi keeps the case.
"""
import re
from typing import NamedTuple, Optional
from urllib.parse import urlsplit

PROTOCOLS = ("https://", "http://", "ssh://", "git://")


class GitSource(NamedTuple):
    host: str
    path: str
    ref: Optional[str]
    pinned: bool


def _split_ref(path):
    """path@ref -> (path, ref) at the first @, unless either side would be empty."""
    head, sep, ref = path.partition("@")
    if not sep or not head or not ref:
        return path, None
    return head, ref


def parse(source):
    if not isinstance(source, str):
        return None
    text = source.strip()
    prefixed = text.startswith("git:") and not text.startswith("git://")
    url = text[4:].strip() if prefixed else text
    if not prefixed and not url.startswith(PROTOCOLS):
        return None
    url, _, hash_ref = url.partition("#")
    scp = re.fullmatch(r"git@([^:]+):(.+)", url)
    if scp:
        host = scp[1]
        path, at_ref = _split_ref(scp[2])
    elif url.startswith(PROTOCOLS):
        try:
            parts = urlsplit(url)
            host = parts.hostname or ""
        except ValueError:
            return None
        path, at_ref = _split_ref(parts.path.lstrip("/"))
    else:
        host, slash, path = url.partition("/")
        if not slash or ("." not in host and host != "localhost"):
            return None
        path, at_ref = _split_ref(path)
    path = path.rstrip("/")
    if path.endswith(".git"):
        path = path[:-4]
    path = path.lstrip("/")
    if not host or not path or len(path.split("/")) < 2:
        return None
    ref = hash_ref or at_ref or None
    return GitSource(host.lower(), path, ref, ref is not None)
