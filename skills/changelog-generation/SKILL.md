---
name: changelog-generation
description: "Trigger this skill when preparing any release or when the user asks what has changed — even if they don't explicitly mention changelogs. Trigger when the user says 'changelog', 'release notes', 'what changed', 'prepare release', 'version bump', 'tag a release', 'what's new', 'summarize changes', 'update CHANGELOG', 'ship a version', or 'what did we do since last release'. Trigger when preparing a new release, generating release notes for a version tag, summarizing changes for stakeholders, or updating CHANGELOG.md. Generates structured release notes from git history using Keep a Changelog format. DO NOT TRIGGER for session-level summaries — use session-wrap instead. DO NOT TRIGGER for PR descriptions — use pr-workflow instead."
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

The range is: `[last-tag]..HEAD` (or `[first-commit]..HEAD` if no tags).

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
