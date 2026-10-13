"""pi_source.py: read a Pi package source the way Pi 0.73.1 does.

install.sh and hosts.sh both load this file by its path, so the two read Pi's settings alike.

  parse(source)    -> GitSource(host, path, ref, pinned) for a source Pi installs from git, else None
  is_local(source) -> True for a source Pi reads as a local path: neither npm: nor git

This ports parseGitUrl, splitRef and parseGenericGitUrl (dist/utils/git.js), the local-path test of
parseSource (dist/core/package-manager.js), and the parts of hosted-git-info 9.0.3 that parseGitUrl calls.
What that comes to:
  - With a git: prefix, every shorthand is read: host/path (the host has a dot or is localhost),
    https://, http://, ssh://, git://, and the scp form git@host:path. Pi counts git:// as that prefix,
    so an unprefixed git:// URL is read only for the hosts hosted-git-info knows.
  - Without the prefix, only an explicit protocol URL is: https://, http://, ssh://.
  - A ref pins the package. It follows the path as @ref (in the scp form, the first @ after host:path).
    For the hosts hosted-git-info knows (GitHub, GitLab, Bitbucket, gist, sourcehut) it may also come
    as #ref, and on GitHub as /tree/<ref>; www. leaves their host, and github.com:owner/repo is read.
  - Elsewhere .git leaves the path only from its very end, so a trailing slash stays. Pi clones a git
    package into <agent dir>/git/<host>/<path>.
  - The host is lowercased for http(s) URLs and the known hosts; elsewhere it keeps its case.
Not ported: the URL standard's percent-encoding, IDNA, IPv6 hosts and dot segments.
"""
import re
from typing import NamedTuple, Optional
from urllib.parse import unquote


class GitSource(NamedTuple):
    host: str
    path: str
    ref: Optional[str]
    pinned: bool


def parse(source):
    """parseGitUrl, for a source parseSource hands to it (an http:, https: or ssh: URL, or git:)."""
    if not isinstance(source, str):
        return None
    text = source.strip()
    prefixed = text.startswith("git:")
    url = text[4:].strip() if prefixed else text
    if not prefixed and not url.startswith(("https://", "http://", "ssh://")):
        return None
    repo, ref = _split_ref(url)
    # Pi asks hosted-git-info about the source with its @ref turned into #ref, then as written, then both
    # behind https://, and skips an answer whose project still holds an @. A gist without an owner gets
    # the owner "null", as in Pi's template string.
    tagged = [repo + "#" + ref] if ref else []
    for candidate in tagged + [url] + ["https://" + c for c in tagged + [url]]:
        info = _hosted(candidate)
        if info and not (ref and "@" in info[2]):
            domain, user, project, committish = info
            pin = committish or ref or None
            return GitSource(domain, _strip_git(("null" if user is None else user) + "/" + project), pin, bool(pin))
    generic = _generic(url)
    return GitSource(*generic, bool(generic[2])) if generic else None


def is_local(source):
    """parseSource's local type: every string that is neither an npm: source nor a git one."""
    return isinstance(source, str) and not source.startswith("npm:") and parse(source) is None


def _strip_git(path):
    return path[:-4] if path.endswith(".git") else path


def _split_ref(url):
    """splitRef: (repo, ref) with the ref after the first @ of the path, or (url, None)."""
    scp = re.fullmatch(r"git@([^:]+):(.+)", url)
    if scp:
        head, _, ref = scp[2].partition("@")
        return ("git@" + scp[1] + ":" + head, ref) if head and ref else (url, None)
    if "://" in url:
        parsed = _url(url)
        if parsed is None:
            return url, None
        head, _, ref = parsed.pathname.lstrip("/").partition("@")
        if not head or not ref:
            return url, None
        # Setting the path of a URL without an authority changes nothing.
        repo = _href(parsed._replace(pathname="/" + head) if parsed.authority else parsed)
        return (repo[:-1] if repo.endswith("/") else repo), ref
    host, slash, rest = url.partition("/")
    head, _, ref = rest.partition("@")
    return (host + "/" + head, ref) if slash and head and ref else (url, None)


def _generic(url):
    """parseGenericGitUrl: (host, path, ref) or None."""
    repo, ref = _split_ref(url)
    scp = re.fullmatch(r"git@([^:]+):(.+)", repo)
    if scp:
        host, path = scp[1], scp[2]
    elif repo.startswith(("https://", "http://", "ssh://", "git://")):
        parsed = _url(repo)
        if parsed is None:
            return None
        host, path = parsed.hostname, parsed.pathname.lstrip("/")
    else:
        host, slash, path = repo.partition("/")
        if not slash or ("." not in host and host != "localhost"):
            return None
    path = _strip_git(path).lstrip("/")
    if not host or not path or len(path.split("/")) < 2:
        return None
    return host, path, ref


# ─── hosted-git-info: fromUrl and its hosts ───────────────────
def _split(pathname, count):
    """pathname.split("/", count) in JavaScript, padded with None."""
    parts = pathname.split("/")[:count]
    return parts + [None] * (count - len(parts))


def _github(pathname, fragment):
    _, user, project, kind, committish = _split(pathname, 5)
    if kind and kind != "tree":
        return None
    if not kind:
        committish = fragment
    project = project and _strip_git(project)
    return (user, project, committish) if user and project else None


def _owner_project(pathname, fragment, refused):   # Bitbucket and sourcehut
    _, user, project, aux = _split(pathname, 4)
    project = project and _strip_git(project)
    return (user, project, fragment) if aux != refused and user and project else None


def _gitlab(pathname, fragment):
    path = pathname[1:]
    if "/-/" in path or "/archive.tar.gz" in path:
        return None
    *segments, project = path.split("/")
    project, user = _strip_git(project), "/".join(segments)
    return (user, project, fragment) if user and project else None


def _gist(pathname, fragment):
    _, user, project, aux = _split(pathname, 4)
    if aux == "raw" or not (user or project):
        return None
    if not project:
        user, project = None, user
    return user, _strip_git(project), fragment


HOSTS = {   # name: (domain, protocols, extract)
    "github": ("github.com", ("git:", "http:", "git+ssh:", "git+https:", "ssh:", "https:"), _github),
    "bitbucket": ("bitbucket.org", ("git+ssh:", "git+https:", "ssh:", "https:"),
                  lambda p, f: _owner_project(p, f, "get")),
    "gitlab": ("gitlab.com", ("git+ssh:", "git+https:", "ssh:", "https:"), _gitlab),
    "gist": ("gist.github.com", ("git:", "git+ssh:", "git+https:", "ssh:", "https:"), _gist),
    "sourcehut": ("git.sr.ht", ("git+ssh:", "https:"), lambda p, f: _owner_project(p, f, "archive")),
}
PROTOCOLS = {"git+ssh:", "ssh:", "git+https:", "git:", "http:", "https:", "git+http:"} | {h + ":" for h in HOSTS}


def _hosted(giturl):
    """fromUrl: (domain, user, project, committish) for a host hosted-git-info knows, else None."""
    if not giturl:
        return None
    url = _correct_protocol("github:" + giturl if _github_shorthand(giturl) else giturl)
    parsed = _url(url) or _url(_correct_url(url))
    if parsed is None:
        return None
    protocol = parsed.scheme + ":"
    shortcut = parsed.scheme if parsed.scheme in HOSTS else None
    hostname = parsed.hostname[4:] if parsed.hostname.startswith("www.") else parsed.hostname
    name = shortcut or next((n for n, host in HOSTS.items() if host[0] == hostname), None)
    if not name:
        return None
    domain, protocols, extract = HOSTS[name]
    fragment = parsed.hash[1:]
    try:
        if shortcut:
            path = parsed.pathname[1:] if parsed.pathname.startswith("/") else parsed.pathname
            path = path[path.find("@") + 1:]
            user, slash, project = path.rpartition("/")
            user = _decode(user) or None if slash else None
            return domain, user, _strip_git(_decode(project)), _decode(fragment) if fragment else None
        segments = extract(parsed.pathname, fragment) if protocol in protocols else None
        if segments is None:
            return None
        user, project, committish = segments
        return domain, user and _decode(user), _decode(project), _decode(committish)
    except ValueError:   # decodeURIComponent's URIError
        return None


def _decode(text):
    """decodeURIComponent, which turns undefined into "undefined" and refuses a malformed escape."""
    if text is None:
        return "undefined"
    if re.search(r"%(?![0-9A-Fa-f]{2})", text):
        raise ValueError(text)
    return unquote(text, errors="strict")


def _github_shorthand(arg):
    """isGitHubShorthand: owner/repo with nothing but an optional #committish after it."""
    hash_at, slash = arg.find("#"), arg.find("/")
    space = re.search(r"\s", arg)

    def after_hash_only(index):
        return index == -1 or (hash_at > -1 and index > hash_at)
    ends_in_slash = (hash_at > 0 and arg[hash_at - 1] == "/") if hash_at > -1 else arg.endswith("/")
    return (after_hash_only(space.start() if space else -1) and slash > 0 and not ends_in_slash
            and not arg.startswith(".") and after_hash_only(arg.find("@")) and after_hash_only(arg.find(":"))
            and after_hash_only(arg.find("/", slash + 1)))


def _correct_protocol(arg):
    colon = arg.find(":")
    if arg[:colon + 1] in PROTOCOLS or (colon > -1 and arg[colon:colon + 3] == "://"):
        return arg
    at = arg.find("@")
    if at > -1:
        return "git+ssh://" + arg if at > colon else arg
    return arg[:colon + 1] + "//" + arg[colon + 1:]


def _last_before(text, char, stop):
    """lastIndexOfBefore: the last char at or before the first stop, or anywhere without one."""
    end = text.find(stop)
    return text.rfind(char, 0, end + 1 if end > -1 else len(text))


def _correct_url(url):
    colon = _last_before(url, ":", "#")
    if colon > _last_before(url, "@", "#"):
        url = url[:colon] + "/" + url[colon + 1:]
    if _last_before(url, ":", "#") == -1 and "//" not in url:
        url = "git+ssh://" + url
    return url


# ─── The URL standard, as far as these sources need it (new URL() in Node) ───
SPECIAL = {"http": "80", "https": "443", "ws": "80", "wss": "443", "ftp": "21"}


class _Url(NamedTuple):
    scheme: str
    username: str
    password: str
    hostname: str
    port: str
    pathname: str
    search: str   # as written, "?" included
    hash: str     # as written, "#" included
    authority: bool


def _url(text):
    """new URL(text) for the sources Pi meets, or None where it throws."""
    match = re.fullmatch(r"([A-Za-z][A-Za-z0-9+.-]*):(.*)", text)
    if not match or match[1].lower() == "file":
        return None
    scheme, rest = match[1].lower(), match[2]
    rest, hash_sep, fragment = rest.partition("#")
    rest, query_sep, query = rest.partition("?")
    search, hash_ = query_sep + query, hash_sep + fragment
    special = scheme in SPECIAL
    if special:
        authority, slash, path = rest.replace("\\", "/").lstrip("/").partition("/")
        pathname = "/" + path
    elif rest.startswith("//"):
        authority, slash, path = rest[2:].partition("/")
        pathname = slash + path
    else:
        return _Url(scheme, "", "", "", "", rest, search, hash_, False)
    userinfo, at, hostport = authority.rpartition("@")
    username, _, password = userinfo.partition(":")
    host, colon, port = hostport.rpartition(":") if ":" in hostport else (hostport, "", "")
    # Credentials or a port need a host; a port is digits.
    if (at or colon) and not host or port and (not re.fullmatch(r"[0-9]+", port) or int(port) > 65535):
        return None
    if re.search(r"[\x00-\x20#/:<>?@\[\\\]^|\x7f" + ("%]" if special else "]"), host):
        return None
    if special:
        if not host:
            return None
        host = host.lower()
        port = "" if port and int(port) == int(SPECIAL[scheme]) else port
    return _Url(scheme, username, password, host, port, pathname, search, hash_, True)


def _href(url):
    """The URL serialized again, as URL.toString() does."""
    if not url.authority:
        return url.scheme + ":" + url.pathname + url.search + url.hash
    userinfo = (url.username + (":" + url.password if url.password else "") + "@"
                if url.username or url.password else "")
    port = ":" + url.port if url.port else ""
    return url.scheme + "://" + userinfo + url.hostname + port + url.pathname + url.search + url.hash
