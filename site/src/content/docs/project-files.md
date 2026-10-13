---
description: What Agent Blueprint installs in your tool, which files ab-project-start adds to your project, and what each docs/ folder is for.
---

The plugin lives in your tool and puts no files in your project. Your project gets its files from the `ab-project-start` skill: an `AGENTS.md` that every tool reads, and a `docs/` tree where plans, decisions and solved problems stay from one session to the next. Run it first thing in a new project, or when you add the blueprint to one that exists; it merges into your files and never overwrites them. [Set up your project](/docs/getting-started/#set-up-your-project) shows how to call it in each tool.
