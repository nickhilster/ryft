# RyFine Web App

RyFine is a browser app for refining rough prompts into clearer, more precise instructions. Built with React 19, TypeScript, and Vite. Works with Browser AI, a local Ollama model, or hosted providers using your own API key.

Features: provider selection and connection status, Browser AI WebGPU execution, Ollama model detection, a four-stage context assembly pipeline, repo-context file uploads, GitHub repo import, custom rules, custom skills with automatic keyword activation, pipeline trace chips with assembled-prompt expansion, project memory with few-shot examples, A/B model comparison, prompt library with templates, request-size estimates, image input, iterative refinement, command palette, prompt quality scoring, mobile tabs, and streaming output.

The web app now consumes the shared `@ryfine/core` workspace package for provider dispatch and prompt assembly logic, alongside the browser-only web UI modules in `web/src/`.

## Context assembly pipeline

Each refinement runs through the same client-side pipeline before any provider call:

1. Built-in skill selection from the chosen mode, with deterministic intent classification when the mode is `Auto`.
2. User-skill activation based on keyword signals saved in the Skills drawer.
3. Context assembly that merges repo context, custom rules, and project few-shot examples into one system prompt plus one user message.
4. Provider dispatch with a visible pipeline trace for single-result runs so you can inspect applied layers or expand the assembled prompt.

## Scripts

Install dependencies from the repository root first:

```bash
npm install
```

From the repository root, the main web workflows are:

```bash
npm --prefix web run dev      # local dev server at http://localhost:5173
npm --prefix web run build    # production build to web/dist/
npm --prefix web run lint
npm --prefix web run test
```

Focused validation commands for the shipped pipeline upgrade:

```bash
npm --prefix web run build
npm --prefix web run lint
npm --prefix web run test
npm --prefix web run test:browser:report
```

## Optional environment

- `VITE_GITHUB_CLIENT_ID`: enables GitHub device-flow auth in the repo-context drawer so users can import repository files directly from GitHub.

## PWA

The web app now ships with a manifest and service worker via `vite-plugin-pwa`. The core app shell is precached for installable/offline startup, while the large Browser AI runtime stays lazy-loaded and outside the precache.

## Browser report harness

The web package includes a Playwright harness that validates the browser UI against a local mock Ollama-compatible SSE server.

Install Chromium once:

```bash
npm --prefix web run test:browser:install
```

Generate the report:

```bash
npm --prefix web run test:browser:report
```

The harness starts its own local Vite server, runs browser scenarios, and writes fresh artifacts to `test-results/browser-report/`:

- `browser-report.html`
- `browser-report.json`
- `browser-report.pdf`
- `compare-mode.png`
- `error-state.png`

Automated cases cover:

- landing state with settings open
- empty input behavior
- repo-context upload persistence after reload
- special-character prompts
- large prompt responsiveness
- compare mode choose / copy / use flow
- API error handling
- delayed streaming completion with a visible Stop state

No real model credentials are required — the harness supplies its own local mock endpoint.
