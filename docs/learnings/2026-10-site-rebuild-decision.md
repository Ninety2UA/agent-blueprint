---
title: "Decision record: the website moves into site/, an Astro build served by Vercel at agent-blueprint.dbenger.com"
date: 2026-10-08
category: scope-decision
cycle: site-rebuild
requirement: R10, R13, R15, R16, R17
applies_when:
  - Someone wants to add a package for the website and asks whether the zero-dependency rule allows it
  - A change touches only site/ or the README's images and the question is whether the version must be bumped
  - Someone proposes a separate site branch, a return to GitHub Pages, or media hosted outside the repository
  - Someone asks for the old github.io address to forward to the new domain
  - A count, skill, install route or release on the site is wrong and the question is where it comes from
tags: [scope-decision, site, astro, vercel, dependencies, version-bump, media, github-pages]
---

# The website moves into site/, built with Astro and served by Vercel

> **Outcome (2026-10-08):** the website's source lives in `site/` on `main`. It is an Astro build that only maintainers run, its packages are listed in `site/package.json` and nowhere else, and Vercel hosts it at agent-blueprint.dbenger.com. Pages, counts, install routes and release notes are generated from the repository when the site is built. The videos and the README hero GIF are rendered once and committed. The old GitHub Pages address is switched off rather than forwarded. This record scopes the zero-dependency rule of `docs/learnings/2026-10-portability-decision.md` to the plugin, and says why changes to the site and to README images need no version bump.

## Context

Until this change the site was `index.html` at the repository root, a single 190 KB page served by GitHub Pages at `ninety2ua.github.io/agent-blueprint`. Every fact on it was typed by hand. The drift gate checked the counts and skill grids inside it, so adding a skill meant editing that file as well as the README.

The portability record kept "zero-dependency, markdown-only" as the plugin's identity: the gates are standard-library Python, the runner and the installer are bash, and nothing is generated at build time. A multi-page site built with Astro, React islands and Pagefind needs npm packages and a build step, so the rule needed a stated boundary before the site could exist.

## Decision

All of these were settled in the planning session, either directed by the user or approved by them.

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Where the site lives | `site/` on `main`, beside the plugin | A separate site branch | The site is built from the skills and the README, so CI builds and checks it in the same pull request that changes them. The user accepted the cost: `site/` and about 6 MB of media ship with every plugin install |
| Dependencies | Astro 7 and its packages, pinned in `site/package.json` and its lock file; Node 22.12 or later | Reusing the mockups' Python HTML generator, which needs no packages; adding anything to the root `package.json` | The user asked for shadcn/ui components. The root `package.json` is Pi's manifest, and Pi installs its dependencies on a git install, so a site package there would reach Pi users |
| Host | Vercel, building from the Git repository with `site/` as the project root, at agent-blueprint.dbenger.com | GitHub Pages | The user moved the site to their own subdomain. Vercel also gives every pull request a preview deployment |
| The old address | Removed: GitHub Pages is turned off and old links return 404 | A temporary forwarding page | The user wants the old address gone and accepted the broken links |
| Content | Generated at build time from `skills/*/SKILL.md`, the README's tables and sections, `.claude-plugin/plugin.json` and `docs/releases/` | Typing counts, skill lists or release notes into site source | The README stays the one checked source for those facts, and a hand-kept copy is what drifted in `index.html` |
| Media | Rendered once from the HyperFrames sources in `site/motion/` and committed: videos and posters in `site/public/media/`, the README hero at `docs/images/hero.gif` | Hosting media outside the repository, such as GitHub Release assets fetched at build time | The user accepted the size. If repository growth becomes a complaint, fetching from a release is the fallback |
| Version bumps | Changes under `site/` and to README images are not plugin content | Bumping the version for every site change | No installed skill or hook changes with them. A bump edits every manifest and every skill that carries a `metadata.version`, and makes each installed cache re-sync with nothing new to run |
| Cutover | Two pull requests. The first adds the site and an empty `.nojekyll` and keeps `index.html` with its gate checks; Pages is turned off after the user's go; the second deletes `index.html`, `.nojekyll` and those checks and points links at the new domain | Deleting `index.html` in the same pull request that adds the site | The old page stays up until the new site is verified. `.nojekyll` stops the legacy Pages build from rendering the new Markdown under `site/` in the meantime, and the old address never falls back to serving `README.md` as its home page |

## The dependency boundary

The portability record's verdict still holds for everything a host loads: skills, helper prompts, hooks, the gates, the installer and the ship runner. `site/` sits outside that boundary. Its packages exist only in `site/package.json` and `site/package-lock.json`, the root `package.json` is unchanged, and the new built-site gate, `scripts/check-site.py`, uses only the Python standard library.

No host reads anything under `site/`. Claude Code, Cursor CLI and Amp install the tracked tree and so carry `site/` along unused. Codex and Antigravity installs from a checkout also take ignored files, and `site/node_modules` holds `SKILL.md` files from npm packages (dotenv and get-tsconfig ship some). That is why `AGENTS.md` says to install the plugin locally only from a clean checkout or worktree.

People who change only skills need no Node. The drift gate, which runs without it, fails when a skill folder is missing from the README phase tables or sits in two of them, and the CI `site` job builds the site on every pull request.

## Where the site's facts come from

| On the site | Source |
|---|---|
| Skill pages and the catalog | `skills/*/SKILL.md` and the README's "Skills reference" phase tables |
| Helper prompts | The README's "Helper prompts reference" table and the prompt files under `skills/*/references/agents/` |
| Install routes, naming syntax and support notes | The README's install, naming and support tables |
| Docs and Guides pages | README sections, mapped by heading in `site/src/lib/readme-map.mjs`; only each page's intro, sidebar position and cross-links are written by hand |
| Skill, helper prompt and hook counts | The tree, counted by the rules `scripts/check-drift.sh` uses |
| Version | `.claude-plugin/plugin.json` |
| Changelog | The README's release history and `docs/releases/*-release-notes.md` |

Two gates hold the site to these sources. The drift gate fails on a literal skill, helper or hook count in `site/src/` or `site/motion/` (the README hero's source excepted) and on adoption wording there. `scripts/check-site.py` checks the built pages: one per skill, every helper prompt listed, every marked count and version equal to the tree, internal links that resolve, and no `SKILL.md` in the output. A README heading that a Docs or Guides page maps to and that no longer exists stops the build.

## Media and the re-render rule

`site/motion/RENDER.md` holds the rule. A video is re-rendered and committed only when its content changes, because every committed render stays in git history and Codex and Antigravity installs from a checkout copy `.git` as well. The film and the four loops state no counts, so a new skill never forces a re-render of them.

The README hero is the exception. It says "53 skills", and the drift gate compares that sentence in `site/motion/readme-hero/composition.html` with the tree, so adding or removing a skill means updating the sentence, re-rendering, and committing the new `docs/images/hero.gif`. It stays a GIF because GitHub does not play video files from the repository inside a README. The approved hero keeps the count; dropping the number from the line would end these re-renders and is the open alternative.

The old hero source (`docs/images/hero/` and `scripts/record-hero.js`), the overview GIF and video, and their promo source (`docs/images/promo-video.html` and `scripts/record-promo.js`) are deleted. The drift gate's promo check went with them in the same commit.

## Consequences

Users get the same plugin. Installs that copy the tracked tree are about 6 MB larger, and nothing in `site/` runs in any host.

The maintainer needs Node 22.12 or later to build the site locally, and HyperFrames with ffmpeg to re-render media. Adding or removing a skill costs a hero re-render. Renaming or removing one also means editing the hand-written tutorials, guides, docs and workflow pages that name it, and the internal-link check in `check-site.py` lists those pages until they are fixed.

## Verdicts

### Zero dependency: kept for the plugin, scoped away from site/

The plugin still has no package dependencies: the gates are standard-library Python, the runner and the installer are bash, and the skills are Markdown. The site's packages are a maintainer build tool, listed only in `site/package.json`, and no host loads them.

### A separate site branch: rejected

It would split the site from the skills and README it is built from. The install-size cost of keeping both on `main` was accepted.

### GitHub Pages, and a forwarding page for its address: rejected

The site moved to the user's own subdomain on Vercel. The old address is switched off after the new site is verified, and old links return 404.

### Media hosted outside the repository: rejected for now

Fetching renders from a GitHub Release at build time is the fallback if repository growth becomes a problem.

### Site and README image changes as plugin content: no

They change nothing an installed host runs, so they need no version bump. A change that touches a skill, a helper prompt, a hook or a manifest in the same pull request still does.
