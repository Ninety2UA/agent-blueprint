---
name: plugin-update
description: "Trigger this skill when the user wants to update the Agent Blueprint plugin from GitHub — even if they just say 'update' without specifying what. Trigger when the user says 'update', 'update plugin', 'update blueprint', 'latest version', 'upgrade blueprint', 'new version available', 'check for updates', 'get newest version', 'refresh plugin', or 'reinstall blueprint'. Clones latest from GitHub, copies to cache, and updates the registry. DO NOT TRIGGER for updating project dependencies — use dependency-management instead. DO NOT TRIGGER for migrating from v2.x to v3.0 — use migrate-to-plugin instead."
---

# Plugin Update

Update the blueprint plugin to the latest version from the source GitHub repository.

**Announce at start:** "Updating Agent Blueprint plugin..."

## Step 0: Try the native update first

Claude Code updates a plugin by its bare `plugin@marketplace` name since 2.1.246, and `claude plugin update --json` exists since 2.1.268. Run the native path first; it refreshes the marketplace catalog, targets the registry entry's own scope (installs are often project-scoped), and verifies the cached `plugin.json` against `main` before trusting the result. Run it from the project root, because project-scoped entries are matched by path.

```bash
# Step 0 — native update. The LAST line printed is the verdict:
#   LEGACY INSTALL          -> stop; relay the printed install.sh command
#   NATIVE UPDATE OK        -> skip to Step 6 (report only; nothing to clean up)
#   FALLING THROUGH: <why>  -> tell the user why, then continue with Step 2
PLUGIN_ID="agent-blueprint@agent-blueprint"
REGISTRY="$HOME/.claude/plugins/installed_plugins.json"
INSTALL_SH="https://raw.githubusercontent.com/Ninety2UA/agent-blueprint/main/install.sh"
REMOTE_MANIFEST="https://raw.githubusercontent.com/Ninety2UA/agent-blueprint/main/.claude-plugin/plugin.json"
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

fall_through() { echo "FALLING THROUGH: $1"; exit 0; }

# Resolve ONE registry entry (the key holds a list of per-scope installs):
# the scope=user entry if present, else the project/local entry whose
# projectPath is this project. Prints "scope|installPath|version|sha|updated",
# "LEGACY" (no entry at all) or "NONE" (no entry for this project, or ambiguous).
resolve_entry() {
  PLUGIN_ID="$PLUGIN_ID" REGISTRY="$REGISTRY" PROJECT_ROOT="$PROJECT_ROOT" python3 -c "
import json, os
try:
    with open(os.environ['REGISTRY']) as fh:
        entries = json.load(fh).get('plugins', {}).get(os.environ['PLUGIN_ID'], [])
except (OSError, ValueError):
    entries = []
if isinstance(entries, dict):
    entries = [entries]
if not entries:
    print('LEGACY'); raise SystemExit
root = os.path.realpath(os.environ['PROJECT_ROOT'])
user = [e for e in entries if e.get('scope') == 'user']
here = [e for e in entries if e.get('scope') in ('project', 'local')
        and e.get('projectPath') and os.path.realpath(e['projectPath']) == root]
pick = user or here
if len(pick) == 1:
    e = pick[0]
    print('|'.join(str(e.get(k, '')) for k in ('scope', 'installPath', 'version', 'gitCommitSha', 'lastUpdated')))
else:
    print('NONE')
"
}

ENTRY=$(resolve_entry)
case "$ENTRY" in
  LEGACY)
    echo "Legacy install (no plugin registry entry) — update with: curl -fsSL $INSTALL_SH | bash -s -- --legacy --force /path/to/project"
    echo "LEGACY INSTALL"
    exit 0 ;;
  NONE)
    fall_through "no scope=user entry and no single entry for $PROJECT_ROOT" ;;
esac
IFS='|' read -r SCOPE INSTALL_PATH CUR_VERSION CUR_SHA CUR_UPDATED <<< "$ENTRY"
echo "version: $CUR_VERSION"
echo "sha: $CUR_SHA"
echo "updated: $CUR_UPDATED"
echo "path: $INSTALL_PATH"
echo "scope: $SCOPE"

command -v claude >/dev/null 2>&1 || fall_through "claude CLI not on PATH"

# Refresh the marketplace catalog, then update this entry's own scope.
# Bare plugin@marketplace name: 2.1.246+; --json: 2.1.268+; --yes is required
# when stdin is not a TTY. An older CLI rejects the flags and falls through.
claude plugin marketplace update agent-blueprint || fall_through "marketplace update failed"
UPDATE_OUT=$(claude plugin update "$PLUGIN_ID" --scope "$SCOPE" --json --yes) || fall_through "claude plugin update failed (exit $?): $UPDATE_OUT"
echo "$UPDATE_OUT"

# Remote version on main.
REMOTE_VERSION=$(curl -fsSL --max-time 15 "$REMOTE_MANIFEST" | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])") || fall_through "could not fetch remote plugin.json from main"
[ -n "$REMOTE_VERSION" ] || fall_through "remote plugin.json has no version"

# Re-resolve: a successful update rewrites the entry's installPath to the new
# version-keyed cache dir, and that cached plugin.json is what we verify.
ENTRY=$(resolve_entry)
case "$ENTRY" in LEGACY|NONE) fall_through "registry entry missing after update ($ENTRY)" ;; esac
IFS='|' read -r SCOPE INSTALL_PATH NEW_VERSION NEW_SHA NEW_UPDATED <<< "$ENTRY"

CACHED_MANIFEST="$INSTALL_PATH/.claude-plugin/plugin.json"
if [ -f "$CACHED_MANIFEST" ]; then
  LOCAL_VERSION=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$CACHED_MANIFEST") || fall_through "cached plugin.json unreadable at $CACHED_MANIFEST"
  LOCAL_SOURCE="$CACHED_MANIFEST"
else
  # Only when the cached manifest is missing: this entry's row in plugin list --json.
  LOCAL_VERSION=$(claude plugin list --json | PLUGIN_ID="$PLUGIN_ID" SCOPE="$SCOPE" PROJECT_ROOT="$PROJECT_ROOT" python3 -c "
import json, os, sys
root = os.path.realpath(os.environ['PROJECT_ROOT'])
rows = [r for r in json.load(sys.stdin)
        if r.get('id') == os.environ['PLUGIN_ID'] and r.get('scope') == os.environ['SCOPE']
        and (r.get('scope') == 'user'
             or (r.get('projectPath') and os.path.realpath(r['projectPath']) == root))]
print(rows[0].get('version', '') if len(rows) == 1 else '')
") || fall_through "claude plugin list --json failed"
  LOCAL_SOURCE="claude plugin list --json"
fi
[ -n "$LOCAL_VERSION" ] || fall_through "could not determine the installed version"

if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
  if [ "$CUR_VERSION" = "$NEW_VERSION" ]; then
    echo "✓ Blueprint already up to date at v$LOCAL_VERSION (commit ${NEW_SHA:0:7})"
  else
    echo "✓ Blueprint updated v$CUR_VERSION -> v$NEW_VERSION (commit ${NEW_SHA:0:7}, $NEW_UPDATED)"
  fi
  echo "  Scope: $SCOPE"
  echo "  Cache: $INSTALL_PATH"
  echo "  Verified: $LOCAL_SOURCE matches plugin.json on main"
  echo ""
  echo "  Run /reload-plugins (or restart) to use the updated plugin."
  echo "NATIVE UPDATE OK"
else
  fall_through "installed v$LOCAL_VERSION ($LOCAL_SOURCE) differs from v$REMOTE_VERSION on main"
fi
```

Act on the **last line** the script printed:

- `LEGACY INSTALL` — no plugin registry entry exists, so this is a legacy (in-project) install. Relay the printed `install.sh --legacy --force` command to the user and stop; the remaining steps do not apply.
- `NATIVE UPDATE OK` — the native update succeeded and the cached `plugin.json` matches `main`. Skip to Step 6 and report; there is no clone to clean up.
- `FALLING THROUGH: <reason>` — tell the user the reason, then continue with Step 2. Step 0 already performed Step 1's registry read (the `version:` / `sha:` / `path:` lines above), so use that `sha:` as the current SHA.

## Step 1: Read Current State

Read the current installation state:

```bash
# Get current commit SHA from installed_plugins.json
python3 -c "
import json, os
f = os.path.expanduser('~/.claude/plugins/installed_plugins.json')
with open(f) as fh:
    data = json.load(fh)
entry = data.get('plugins', {}).get('agent-blueprint@agent-blueprint', [{}])
if isinstance(entry, list):
    entry = entry[0]
print('version:', entry.get('version', 'unknown'))
print('sha:', entry.get('gitCommitSha', 'unknown'))
print('updated:', entry.get('lastUpdated', 'unknown'))
print('path:', entry.get('installPath', 'unknown'))
"
```

Record the current SHA and install path for later comparison.

## Step 2: Clone Latest from GitHub

Steps 2–5 run only when Step 0 falls through; Step 0 already performed Step 1's registry read.

```bash
TMPDIR=$(mktemp -d)
git clone --depth 1 https://github.com/Ninety2UA/agent-blueprint.git "$TMPDIR/blueprint"
NEW_SHA=$(git -C "$TMPDIR/blueprint" rev-parse HEAD)
echo "Latest commit: $NEW_SHA"
```

If the new SHA matches the current SHA, report "Already up to date" and stop.

## Step 3: Show What Changed

If there IS an update, show the user what changed:

```bash
# Get version from plugin.json
cat "$TMPDIR/blueprint/.claude-plugin/plugin.json" | python3 -c "import json,sys; print('New version:', json.load(sys.stdin)['version'])"

# Show recent commit messages
git -C "$TMPDIR/blueprint" log --oneline -10
```

## Step 4: Copy Plugin Files to Cache

```bash
CACHE_DIR="$HOME/.claude/plugins/cache/agent-blueprint/agent-blueprint"
VERSION=$(cat "$TMPDIR/blueprint/.claude-plugin/plugin.json" | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])")
DEST="$CACHE_DIR/$VERSION"

# Remove old cached version and copy new
rm -rf "$DEST"
mkdir -p "$DEST"

SOURCE="$TMPDIR/blueprint"
for dir in skills agents hooks .claude-plugin scripts templates .claude; do
    if [ -d "$SOURCE/$dir" ]; then
        cp -R "$SOURCE/$dir" "$DEST/$dir"
    fi
done

# Make scripts executable
find "$DEST" -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true

echo "Plugin files updated at $DEST"
```

## Step 5: Update Registry Files

```bash
NEW_SHA=$(git -C "$TMPDIR/blueprint" rev-parse HEAD)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Update known_marketplaces.json
python3 -c "
import json, os
f = os.path.expanduser('~/.claude/plugins/known_marketplaces.json')
with open(f) as fh:
    data = json.load(fh)
data['agent-blueprint']['lastUpdated'] = '$TIMESTAMP'
data['agent-blueprint']['installLocation'] = '$DEST'
data['agent-blueprint']['autoUpdate'] = True
with open(f, 'w') as fh:
    json.dump(data, fh, indent=2)
    fh.write('\n')
"

# Update installed_plugins.json
python3 -c "
import json, os
f = os.path.expanduser('~/.claude/plugins/installed_plugins.json')
with open(f) as fh:
    data = json.load(fh)
key = 'agent-blueprint@agent-blueprint'
entries = data.get('plugins', {}).get(key, [])
if isinstance(entries, list):
    for entry in entries:
        entry['version'] = '$VERSION'
        entry['lastUpdated'] = '$TIMESTAMP'
        entry['gitCommitSha'] = '$NEW_SHA'
        entry['installPath'] = '$DEST'
else:
    entries['version'] = '$VERSION'
    entries['lastUpdated'] = '$TIMESTAMP'
    entries['gitCommitSha'] = '$NEW_SHA'
    entries['installPath'] = '$DEST'
data['plugins'][key] = entries
with open(f, 'w') as fh:
    json.dump(data, fh, indent=2)
    fh.write('\n')
"

echo "Registry updated"
```

## Step 6: Cleanup and Report

Cleanup applies to the manual path only; Step 0's native path makes no clone, and `$TMPDIR` is a system variable on macOS, so remove it only when it holds our clone:

```bash
if [ -d "${TMPDIR:-}/blueprint/.git" ]; then
    rm -rf "$TMPDIR"
fi
```

Report to the user:

```
✓ Blueprint updated to v[VERSION] (commit [SHORT_SHA])
  [N] new commits since last update
  Cache: [DEST]

  Run /reload-plugins (or restart) to use the updated plugin.
```

After the native path (Step 0), reuse the version, scope, and cache path its script printed and omit the commit count: there is no clone, so there is no log to count.

## Important Notes

- The native path (Step 0) updates the **one registry entry it resolved**, in that entry's own scope; the manual path (Steps 2–5) rewrites every entry for the plugin. Both write into the **shared plugin cache**, so every project on that version gets the update
- The user must **run `/reload-plugins`** (or restart) for changes to take effect
- `/plugin install agent-blueprint@agent-blueprint` is the interactive route: since 2.1.232 it refreshes the marketplace first, then installs the latest version. Step 0 does the same refresh explicitly with `claude plugin marketplace update agent-blueprint`
- `claude plugin update` accepts the bare `plugin@marketplace` name since 2.1.246 and `--json` since 2.1.268; an older CLI rejects the flags, which is one of the cases that falls through to the manual steps
- If the version number changed, the old version directory remains in cache (harmless)
