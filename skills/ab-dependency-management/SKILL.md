---
name: ab-dependency-management
description: "Adds, upgrades and removes project dependencies deliberately: checks a new package against five gates (necessity, maintenance, size, license, security) and build-versus-install, installs a pinned version range, commits the manifest and lockfile together with the reason, upgrades by changelog and risk, and removes unused packages cleanly. Use when adding, upgrading or removing a dependency, even a single package, when resolving a version conflict, responding to a security advisory, or auditing dependencies. Not for updating the Agent Blueprint plugin itself, nor for dev tooling that does not ship with the product (linters, formatters), which you can simply install."
---

# Dependency Management

Every dependency is code you don't control, maintained by people you don't know, on a schedule you can't predict: the biggest source of invisible risk. A finished change adds, upgrades or removes one on purpose: justified against the gates below, version pinned, manifest and lockfile changed together, full test suite passing.

**Core principle:** Fewer dependencies, carefully chosen, regularly updated. Every addition is a long-term commitment.

## When to Use

- Adding a new dependency to the project
- Upgrading existing dependencies (minor, major, or security patches)
- Removing a dependency or replacing it with a lighter alternative
- Auditing dependencies after a security advisory
- Evaluating whether to build vs. install

**Don't use when:**
- Installing dev tooling that doesn't ship with the product (linters, formatters)
- Pinning a version temporarily during debugging (just do it, create a BACKLOG item to revisit)
- Updating the Agent Blueprint plugin itself

## Phase 1: Evaluate Before Adding

Before running `install` or adding to the manifest, answer these questions:

### The Five Gates

| Gate | Question | Red Flag |
|------|----------|----------|
| **Necessity** | Can we do this with stdlib or existing deps? | Adding a dep for < 50 lines of code |
| **Maintenance** | Is it actively maintained? When was the last release? | No commits in 12+ months, open security issues |
| **Size** | What's the install footprint? How many transitive deps? | > 50 transitive deps for a utility function |
| **License** | Is the license compatible with our project? | GPL in a proprietary project, SSPL in SaaS |
| **Security** | Any known vulnerabilities? Is there an audit history? | Unpatched CVEs, no security policy |

### Research Checklist

```
- [ ] Check npm/PyPI/crates.io/rubygems for download trends and alternatives
- [ ] Read the README — does it solve your actual problem?
- [ ] Check the issue tracker — are bugs addressed or ignored?
- [ ] Count transitive dependencies (npm ls --all, pip show, bundle list)
- [ ] Check license compatibility
- [ ] Run security audit (npm audit, pip-audit, bundle-audit, cargo audit)
```

### Build vs. Install Decision

Build it yourself when:
- The functionality is < 100 lines
- You only need a small fraction of the library's capability
- The library has a large dependency tree for what you need
- You need precise control over behavior or performance

Install a library when:
- The problem domain is complex (crypto, parsing, image processing)
- The library is well-maintained and widely used
- Rolling your own would introduce security risk
- The library handles edge cases you'd miss

### Decide

Adding a dependency is usually the user's call (many projects' instructions say so), because the team carries each addition for years. Go ahead without asking only when the user's request names this dependency and no gate showed a red flag; otherwise ask, with the gate results and your recommendation.

**Asking the user.** Ask with your question tool if you have one, offering at most three options; otherwise ask in plain text with a numbered list. In a headless or unattended run nobody will answer: take the default named below, say so in your output, and log it in the run state's decisions if there is a run state.

Options: add the package at the version range you recommend; build it in-house instead; add nothing. Default when nobody answers: do not add the dependency; report the recommendation with the gate results.

## Phase 2: Adding a Dependency

1. **Install a pinned version range**, so the lockfile records exactly what was tested
   ```bash
   # Good: pinned version
   npm install package@^2.3.0
   pip install 'package>=2.3,<3.0'
   bundle add package --version '~> 2.3'
   cargo add package@2.3

   # Bad: unpinned
   npm install package
   pip install package
   ```
2. **Verify the lockfile updated**, and stage it with the manifest (`git add package.json package-lock.json` or the equivalent): together they make the build reproducible
3. **Run the full test suite** — ensure nothing breaks with the new dependency

Commit the manifest and lockfile together, with a message that says why you chose this package:

```
feat(deps): add zod for runtime schema validation

Chosen over joi (smaller bundle, TypeScript-native, zero deps).
Evaluated: joi, yup, zod, ajv. Zod won on type inference + size.
```

**Working folder.** Blueprint working files live under `.agent-blueprint/` in the project root. Before the first write there, create `.agent-blueprint/.gitignore` with the lines `run/`, `team/`, `review-runs/` and `cache/` if it does not exist yet, so run state stays out of commits while plans and notes stay tracked.

**No-commit mode.** When the environment variable `AGENT_BLUEPRINT_GIT_WRITABLE` is `0`, or a commit fails because `.git` is read-only, make no commits: leave the changes in the working tree and add the commit message you would have used to `.agent-blueprint/run/commit-msg.md`, and the ship runner commits them after the session. A review step in this mode reviews the working tree and untracked files against the merge base instead of a commit range.

## Phase 3: Upgrading Dependencies

Take security patches immediately, batch patch versions, review changelogs for minor versions, and plan major versions explicitly; cadence table: `references/upgrade-strategy.md`.

### Upgrade Checklist

```
- [ ] Read the changelog/release notes for breaking changes
- [ ] Check if migration guide exists (for major versions)
- [ ] Update dependency in manifest
- [ ] Run full test suite
- [ ] Check for deprecation warnings in test output
- [ ] Verify build output (bundle size, compile time)
- [ ] Test critical paths manually if UI/API changed
- [ ] Commit lockfile with the upgrade
```

### Major Version Upgrades

Major upgrades are features, not chores. Treat them as such:

1. Create a branch for the upgrade
2. Read the full migration guide
3. Use the ab-migration-planning skill if the upgrade touches > 5 files
4. Run the test suite after each migration step
5. Keep major upgrades out of feature work, so a failure points at one cause

## Phase 4: Removing Dependencies

Removing a dependency is a win whenever the replacement is simpler.

1. **Search for all imports/requires** of the dependency
2. **Replace with stdlib or inline code** where possible
3. **Remove from manifest** (package.json, Gemfile, etc.)
4. **Remove from lockfile** (regenerate it)
5. **Run full test suite**
6. **Check for orphaned transitive deps** that are no longer needed

## Common Mistakes

Batch-updating everything, ignoring lockfiles, vendoring without a plan, choosing by stars, skipping changelogs: `references/common-mistakes.md`.

## Integration with Other Skills

A complex major upgrade needs a plan: the ab-writing-plans and ab-migration-planning skills. A security vulnerability (to assess impact) or a dependency that broke the build: the ab-systematic-debugging skill. Build-vs-buy for a feature: the ab-brainstorming skill.
