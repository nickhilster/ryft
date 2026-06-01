---
name: webapp-testing
description: 'Use when testing or debugging the local web app or product page in a real browser. Covers Playwright-based interaction, screenshots, console inspection, and responsive checks.'
---

# Web Application Testing

This skill helps with testing and debugging RyFine's local applications in a real browser using browser automation.

- **`web/`** — React web app, dev server at `http://localhost:5173`
- **`site/`** — Astro product page, dev server at `http://localhost:4321`

Use the Playwright or Chrome DevTools MCP tools when available. If they are unavailable, fall back to a local Node.js plus Playwright workflow.

## When to Use This Skill

- Test frontend functionality in a real browser
- Verify UI behavior and user flows
- Debug web application issues
- Capture screenshots for debugging or docs
- Inspect browser console logs
- Check responsive behavior across viewports

## Prerequisites

- Node.js is available
- The target app is running locally or reachable by URL
- Install Playwright if the current environment does not already provide browser automation

## Starting the Servers

```bash
# Web app
npm --prefix web run dev

# Product page
npm --prefix site run dev
```

## Guidelines

1. Verify the app is running before testing.
2. Start with simple navigation before complex flows.
3. Prefer stable selectors such as roles or `data-testid` values.
4. Use explicit waits around navigation and async UI updates.
5. Capture screenshots when a flow fails.
6. Close or clean up browser resources when the run is finished.

## Common Checks

- Page title and route changes
- Element visibility and text content
- Form submission and streaming behavior
- Console errors and warnings
- Mobile and desktop viewport behavior

## Helper Asset

Helper utilities are available in [`assets/test-helper.js`](./assets/test-helper.js) for waiting on conditions, capturing console logs, and saving screenshots.
