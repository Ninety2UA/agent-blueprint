# Common mistakes

Loaded on demand from SKILL.md when planning a batch of upgrades, a vendored copy, or a choice between packages.

## Common Mistakes

**"Just update everything"** — Batch-updating all deps at once makes it impossible to isolate which upgrade broke something. Update in logical groups.

**Ignoring lockfiles** — Lockfiles ensure reproducible builds, so commit them and keep them out of `.gitignore`.

**Vendoring without a plan** — If you vendor a dependency, you own its maintenance. Create a BACKLOG item to check for updates quarterly.

**Choosing by GitHub stars** — Stars measure popularity, not quality. A 500-star library with zero deps and a clean API beats a 50K-star framework you use 2% of.

**Not reading changelogs** — "It's just a minor version" — until it deprecates the function you depend on. Read the release notes every time.
