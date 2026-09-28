---
name: browser-testing
description: "Trigger this skill when changes touch UI components (.tsx, .jsx, .vue, .svelte, CSS, SCSS, HTML templates) and visual or interaction verification is needed, when the user says 'test in browser', 'check the UI', 'visual testing', 'does it look right', 'verify the layout', 'test the form', or wants to see how changes actually render. Trigger even for CSS-only changes — they can break layout, spacing, and responsiveness in ways unit tests cannot catch. Also trigger for user interaction flows (forms, navigation, modals, dropdowns), responsive layout verification at different viewport sizes, accessibility checks in a real browser context, and whenever unit tests pass but the actual user experience needs confirmation. Requires Playwright MCP or similar browser automation."
---

# Browser Testing

## Overview

Verify UI changes by launching a development server, navigating to the relevant pages, and testing interactions via Playwright MCP browser tools. This provides visual and interactive verification that complements unit tests.

## When to Use

- After implementing UI changes that need visual verification
- Testing user interaction flows (forms, navigation, modals)
- Verifying responsive layouts at different viewport sizes
- Checking accessibility in a real browser context
- When unit tests pass but you need to confirm the actual user experience

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

Use Playwright MCP tools to navigate:

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

**Not closing the browser** — Always close the browser session when done to free resources.

**Manual visual checks without snapshots** — Use accessibility snapshots for programmatic verification. Visual-only checks can't be reproduced or automated later.
