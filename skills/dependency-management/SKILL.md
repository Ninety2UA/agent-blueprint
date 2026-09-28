---
name: dependency-management
description: "Trigger this skill when adding, upgrading, or removing ANY dependency — even a single package install deserves compatibility checking. Trigger when the user says 'add dependency', 'upgrade package', 'remove dependency', 'update deps', 'dependency conflict', 'version mismatch', 'install this library', 'npm install', 'pip install', 'cargo add', 'go get', 'bump version', 'security advisory', or 'audit dependencies'. Trigger even when the user wants to just run 'npm install X' without thinking — evaluate necessity, check compatibility, manage lock files, and plan safe rollback first. DO NOT TRIGGER for updating the blueprint plugin itself — use plugin-update instead. DO NOT TRIGGER for installing dev tooling that doesn't ship with the product (linters, formatters) — just do it."
---

# Dependency Management

## Overview

Dependencies are the biggest source of invisible risk. Every dependency you add is code you don't control, maintained by people you don't know, on a schedule you can't predict. Manage them deliberately.

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

## Phase 2: Adding a Dependency

1. **Install the exact version** — use lockfile pinning
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

2. **Verify lockfile updated** — commit the lockfile with the dependency addition
   ```bash
   git add package.json package-lock.json  # or equivalent
   ```

3. **Run full test suite** — ensure nothing breaks with the new dependency

4. **Document why** — add a brief comment in the commit message explaining the choice
   ```
   feat(deps): add zod for runtime schema validation

   Chosen over joi (smaller bundle, TypeScript-native, zero deps).
   Evaluated: joi, yup, zod, ajv. Zod won on type inference + size.
   ```

## Phase 3: Upgrading Dependencies

### Upgrade Strategy

| Type | Frequency | Process |
|------|-----------|---------|
| **Security patches** | Immediately | Apply, test, deploy |
| **Patch versions** (x.x.PATCH) | Weekly/biweekly | Batch update, test, deploy |
| **Minor versions** (x.MINOR.x) | Monthly | Review changelogs, test, deploy |
| **Major versions** (MAJOR.x.x) | Plan explicitly | Read migration guide, create plan, test thoroughly |

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
3. Use the migration-planning skill if the upgrade touches > 5 files
4. Run the test suite after each migration step
5. Don't bundle major upgrades with feature work

## Phase 4: Removing Dependencies

Removing a dependency is always a win if the replacement is simpler.

1. **Search for all imports/requires** of the dependency
2. **Replace with stdlib or inline code** where possible
3. **Remove from manifest** (package.json, Gemfile, etc.)
4. **Remove from lockfile** (regenerate it)
5. **Run full test suite**
6. **Check for orphaned transitive deps** that are no longer needed

## Common Mistakes

**"Just update everything"** — Batch-updating all deps at once makes it impossible to isolate which upgrade broke something. Update in logical groups.

**Ignoring lockfiles** — Lockfiles ensure reproducible builds. Always commit them. Never `.gitignore` them.

**Vendoring without a plan** — If you vendor a dependency, you own its maintenance. Create a BACKLOG item to check for updates quarterly.

**Choosing by GitHub stars** — Stars measure popularity, not quality. A 500-star library with zero deps and a clean API beats a 50K-star framework you use 2% of.

**Not reading changelogs** — "It's just a minor version" — until it deprecates the function you depend on. Always read release notes.

## Integration with Other Skills

| Situation | Skill |
|-----------|-------|
| Major upgrade is complex, needs a plan | writing-plans + migration-planning |
| Security vulnerability discovered | systematic-debugging (to assess impact) |
| Evaluating build-vs-buy for a feature | brainstorming |
| Dependency broke the build | systematic-debugging |
