---
name: ab-changelog-generation
description: "Generates release notes from git history in Keep a Changelog format: finds the range since the last release tag, sorts the commits into Added, Changed, Deprecated, Removed, Fixed and Security, rewrites them for users with breaking changes and PR links, and adds the entry to CHANGELOG.md. Use when preparing a release or version tag, writing release notes for stakeholders, updating CHANGELOG.md, or answering what changed since the last release. Not for a session summary (ab-session-wrap) or a PR description (ab-pr-workflow)."
argument-hint: "[optional: version number or tag range]"
---

# Changelog Generation

## Overview

Generate structured release notes from git history. Collects commits since the last release, categorizes them, enriches with context, and formats following the Keep a Changelog standard.

## When to Use

- Preparing a new release
- Generating release notes for a version tag
- Summarizing changes for stakeholders
- Updating CHANGELOG.md

## Process

### Step 1: Determine Range

Find the boundaries of the changelog:

```bash
# Find the last release tag
git tag --sort=-v:refname | head -5

# If no tags, use first commit
git log --reverse --format="%H" | head -1
```

The range is: `[last-tag]..HEAD` (or `[first-commit]..HEAD` if no tags). If the user named a tag range, use it instead; a version number they give becomes the entry's heading in Step 5.

### Step 2: Collect Commits

```bash
# All commits in range with full info
git log [last-tag]..HEAD --format="%H|%s|%an|%ai" --no-merges

# Merge commits (for PR-based workflows)
git log [last-tag]..HEAD --merges --format="%H|%s|%an|%ai"
```

### Step 3: Categorize

Sort each commit into Keep a Changelog categories based on the commit message and diff:

| Category | Criteria |
|----------|----------|
| **Added** | New features, new files, new capabilities |
| **Changed** | Modifications to existing features |
| **Deprecated** | Features marked for future removal |
| **Removed** | Features or files removed |
| **Fixed** | Bug fixes |
| **Security** | Vulnerability fixes or security improvements |

If commits follow conventional commit format (`feat:`, `fix:`, etc.), use the prefix. Otherwise, read the diff to categorize.

### Step 4: Enrich

For each significant entry:
- Add a human-readable description (not just the commit message)
- Note breaking changes with a `BREAKING:` prefix
- Link to relevant PR or issue numbers if available
- Group related commits into single entries

### Step 5: Format

Follow the [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [version] - YYYY-MM-DD

### Added
- Description of new feature ([#PR](link))

### Changed
- Description of change ([#PR](link))

### Fixed
- Description of bug fix ([#PR](link))

### Security
- Description of security fix ([#PR](link))

### Breaking Changes
- Description of breaking change and migration path
```

### Step 6: Save

- Update `CHANGELOG.md` at the project root (create if it doesn't exist)
- New entries go at the top, below the `# Changelog` header
- Keep an `## [Unreleased]` section at the top for ongoing work

## Quick Reference

| Commit Prefix | Category |
|--------------|----------|
| `feat:` | Added |
| `fix:` | Fixed |
| `refactor:` | Changed |
| `perf:` | Changed |
| `docs:` | Changed |
| `chore:` | (usually omit unless significant) |
| `BREAKING CHANGE:` | Breaking Changes |
| `security:` | Security |

## Common Mistakes

**Copy-pasting commit messages** — Commit messages are for developers. Changelog entries are for users. Translate technical changes into user-visible impact.

**Including internal changes** — Users don't care about CI fixes, test additions, or code reformatting. Only include changes that affect the user experience or API.

**Missing breaking changes** — Every breaking change needs a migration path. If you can't describe how to upgrade, the breaking change isn't ready to ship.

**Giant changelog entries** — If a single entry is more than 2 sentences, break it into sub-bullets or summarize more aggressively.
