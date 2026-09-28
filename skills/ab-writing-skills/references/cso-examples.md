# ab-writing-skills — description and token-efficiency examples

Loaded on demand from `SKILL.md`; nothing here is needed on every invocation.

## Invoking another skill

A routing line that hands off to another skill names it in prose and says to start it now, so it cannot be read as "tell the user to type something":

```
❌ Weak:  "Next, /ab-other-skill"
            (a slash form works in some hosts only, and reads as advice to the user)

✅ Good:  "Now use the ab-writing-plans skill, passing it the approved design."
```

Name the capability, not one host's tool: "invoke the skill the way this host runs skills" works everywhere, while a single host's tool name works in one.

## Token-efficiency techniques and naming

**Techniques:**

**Move details to tool help:**
```bash
# ❌ BAD: Document all flags in SKILL.md
search-conversations supports --text, --both, --after DATE, --before DATE, --limit N

# ✅ GOOD: Reference --help
search-conversations supports multiple modes and filters. Run --help for details.
```

**Use cross-references:**
```markdown
# ❌ BAD: Repeat workflow details
When searching, dispatch subagent with template...
[20 lines of repeated instructions]

# ✅ GOOD: Reference other skill
Always use subagents (50-100x context savings). REQUIRED: Use [other-skill-name] for workflow.
```

**Compress examples:**
```markdown
# ❌ BAD: Verbose example (42 words)
your human partner: "How did we handle authentication errors in React Router before?"
You: I'll search past conversations for React Router authentication patterns.
[Dispatch subagent with search query: "React Router authentication error handling 401"]

# ✅ GOOD: Minimal example (20 words)
Partner: "How did we handle auth errors in React Router?"
You: Searching...
[Dispatch subagent → synthesis]
```

**Eliminate redundancy:**
- Don't repeat what's in cross-referenced skills
- Don't explain what's obvious from command
- Don't include multiple examples of same pattern

**Verification:**
```bash
wc -c skills/ab-name/SKILL.md
# the whole file, frontmatter included, stays within 8,000 bytes;
# check-portability.py fails anything over
```

**Name by what you DO or core insight:**
- ✅ `condition-based-waiting` > `async-test-helpers`
- ✅ `using-skills` not `skill-usage`
- ✅ `flatten-with-flags` > `data-structure-refactoring`
- ✅ `root-cause-tracing` > `debugging-techniques`

**Gerunds (-ing) work well for processes:**
- `creating-skills`, `testing-skills`, `debugging-with-logs`
- Active, describes the action you're taking

## Description examples

Lead with what the skill does and how, then "Use when ..." with the situations that call for it. Tools such as Codex and Amp choose a skill from a one-line catalog entry, so a description that only lists triggers leaves them guessing what the skill is.

```yaml
# ❌ Weak: too abstract, says neither what nor when
description: For async testing

# ❌ Weak: first person
description: I can help you with async tests when they're flaky

# ❌ Weak: triggers only; a catalog reader cannot tell what the skill does
description: Use when tests have race conditions or pass and fail inconsistently

# ✅ Good: the mechanism, then when to use it
description: Replaces fixed sleeps in tests with polling for the condition the test waits on. Use when tests have race conditions, timing dependencies, or pass and fail inconsistently.

# ✅ Good: technology-specific, and says so
description: Handles authentication redirects in React Router with a loader-level guard. Use when a React Router app sends signed-out users to a login page.
```

## What, then when, never the whole workflow

A description names the mechanism in one clause; it does not walk through the steps. When a description summarized a skill's process ("code review between tasks"), agents followed the description and skipped the body: they ran one review where the skill's flowchart had two. Say what the skill does and when to use it, and leave the how to the body.

```yaml
# ❌ Weak: walks through the workflow; agents follow this instead of the skill
description: Executes plans by dispatching a subagent per task, then reviewing spec compliance, then code quality

# ✅ Good: what it does in one clause, then when
description: Executes an implementation plan with a fresh helper per task and two reviews each. Use when a written plan has independent tasks to run in this session.
```

## Discovery Workflow

How future Claude finds your skill:

1. **Encounters problem** ("tests are flaky")
2. **Finds SKILL** (description matches)
3. **Scans overview** (is this relevant?)
4. **Reads patterns** (quick reference table)
5. **Loads example** (only when implementing)

**Optimize for this flow** - put searchable terms early and often.
