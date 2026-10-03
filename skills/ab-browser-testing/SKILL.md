---
name: ab-browser-testing
description: "Verifies UI changes in a real browser: starts the dev server, opens the affected pages with a browser automation tool (such as a Playwright MCP server), reads accessibility snapshots, runs the interaction flows including error states, checks mobile, tablet and desktop widths, and reports pass or fail per check; without a browser tool it lists the checks to run by hand. Use when a change touches UI components (.tsx, .jsx, .vue, .svelte), CSS, SCSS or HTML templates, CSS-only changes included; when the user asks for a browser, UI, form or layout check; or when unit tests pass but the rendered experience still needs confirming."
---

# Browser Testing

Verify UI changes by launching a development server, navigating to the relevant pages, and testing interactions with a browser automation tool. This provides visual and interactive verification that complements unit tests. The run is done when the Step 6 results table covers every check the change needs.

## When to Use

- After implementing UI changes that need visual verification
- Testing user interaction flows (forms, navigation, modals)
- Verifying responsive layouts at different viewport sizes
- Checking accessibility in a real browser context
- When unit tests pass but you need to confirm the actual user experience

## What You Need

A browser automation tool, such as a Playwright MCP server or Claude in Chrome, that can navigate to a URL, take an accessibility snapshot, click and type, and resize the viewport. Steps 2 to 5 use it.

If the host has none, say so at the start: the checks cannot be run here. Still start the dev server if you can (Step 1), then follow "Without a Browser Tool" below instead of Steps 2 to 5.

## Process

### Step 1: Start the Dev Server

```bash
# Start the development server (check CONVENTIONS.md for the correct command)
[dev server command] &

# Wait for it to be ready
# The server should output a URL like http://localhost:3000
```

If the dev server command isn't known, check:
- `package.json` scripts (`dev`, `start`, `serve`)
- `Makefile` targets
- `docs/context/CONVENTIONS.md`

### Step 2: Navigate to the Page

With the browser tool:

1. Open the browser and navigate to the relevant URL
2. Wait for the page to fully load
3. Take an accessibility snapshot to understand the page structure

### Step 3: Verify Visual State

Take a snapshot and verify:
- The expected elements are present
- Layout matches expectations
- Text content is correct
- Interactive elements are visible and accessible

### Step 4: Test Interactions

For each user flow to test:
1. Identify the interactive elements from the snapshot
2. Perform the interaction (click, type, select)
3. Wait for the expected result
4. Take another snapshot to verify the outcome

**Common interactions:**
- Fill out a form and submit it
- Click navigation links and verify page changes
- Open and close modals/dropdowns
- Test error states (invalid input, network errors)

### Step 5: Test Responsive Behavior

If the change involves layout:
1. Resize the browser to mobile width (375px)
2. Take a snapshot — verify mobile layout
3. Resize to tablet width (768px)
4. Take a snapshot — verify tablet layout
5. Resize back to desktop (1280px)

### Step 6: Document Results

```markdown
### Browser Test Results

**URL tested:** [URL]
**Changes verified:** [what was tested]

| Test | Result | Notes |
|------|--------|-------|
| [interaction/visual check] | Pass/Fail | [details] |

**Screenshots saved:** [paths if applicable]
```

Close the browser session when you are done, so it does not hold memory and connections the next run needs.

## Without a Browser Tool

Give the user the checks to run by hand, built from Steps 2 to 5 for the pages this change touches:

- The URL of each affected page, and the elements and text it should show
- Each interaction to perform (submit a form, follow a link, open and close a modal or dropdown, enter invalid input) and the result to expect
- If the layout changed: the page at 375px (mobile), 768px (tablet) and 1280px (desktop)
- Keyboard navigation through the changed elements, with visible focus

Then fill in the Step 6 table with every row marked "Not run (manual)" rather than Pass, so nobody takes an unverified check as verified.

## Quick Reference

| Verification Type | What to Check |
|------------------|---------------|
| Visual | Elements present, layout correct, text matches |
| Interactive | Click/type works, form submits, navigation flows |
| Responsive | Mobile/tablet/desktop layouts |
| Accessibility | Keyboard navigation, screen reader compatibility |
| Error states | Invalid input handling, error messages shown |

## Common Mistakes

**Not waiting for page load** — Take a snapshot after navigation to confirm the page is ready before interacting.

**Testing only the happy path** — Also test error states, empty states, and edge cases (very long text, special characters).

**Manual visual checks without snapshots** — When a browser tool is available, use accessibility snapshots for programmatic verification. Visual-only checks can't be reproduced or automated later.
