# RyFine ⚡

Sharpen every prompt. RyFine takes your raw instruction and returns a refined, professional-grade version using the AI provider and model you choose — with your keys, on your terms.

RyFine is a browser-based tool at [ryfine.app](https://ryfine.app) that works with Browser AI, Ollama, OpenRouter, Gemini, Groq, Anthropic, OpenAI, and DeepSeek.

## Features

- **Prompt refinement** — drop in rough text and get a structured, precise version back
- **Repo context** — upload source files or connect a local Git repo so the model grounds refinements in your actual codebase
- **GitHub repo import** — connect GitHub with device flow, pick a repo, and pull filtered source files straight into repo context
- **Four-stage context assembly pipeline** — classify intent, select built-in skills, merge repo context, custom rules, project examples, and matching user skills, then send one assembled prompt to the chosen provider
- **Custom skills** — save reusable domain-specific lenses and keyword triggers, then layer them into refinements when the prompt matches
- **Pipeline trace** — inspect the applied skills and context chips for each single-result run, then expand the exact assembled system prompt when you need to debug or tune it
- **A/B model comparison** — run two providers or models in parallel and pick the stronger result
- **Project memory** — archive refinements to a project; recent input/output pairs are injected as few-shot examples so the model learns your style
- **Prompt library** — save, tag, and reuse prompts as templates with `{{ variable }}` slots
- **Browser AI** — run small WebGPU-backed models locally in Chrome or Edge with no API key
- **Built-in skills** — Auto, Coding, Content, Data, Research, Design, Planning, and General drive the pipeline's built-in context lenses, with Auto using deterministic intent classification before assembly
- **Image input** — paste or attach an image alongside your prompt for vision-capable providers
- **Installable PWA** — save RyFine to your desktop or home screen and keep the core shell cached offline
- **Local-first privacy** — API keys live in `localStorage` only; nothing passes through RyFine servers; use Ollama for 100% offline refinement

## Supported providers

| Provider | Tier |
| --- | --- |
| Browser AI | Free (local WebGPU) |
| Ollama | Free (local) |
| OpenRouter | Free tier |
| Gemini | Free tier |
| Groq | Free tier |
| Anthropic | Paid API |
| OpenAI | Paid API |
| DeepSeek | Paid API |

## Web app

Open [ryfine.app](https://ryfine.app) in any browser:

1. Open Settings and pick a provider. Browser AI and Ollama do not require keys. For hosted providers, paste your API key — it is stored in `localStorage` only.
2. Type or paste your raw prompt in the left pane.
3. Optionally add reusable lenses under **Skills**, upload repo files under **Context**, connect a local Git folder, or connect GitHub to ground the refinement.
4. Click **RyFine ✦** (or press `Ctrl+Enter` / `Cmd+Enter`).
5. Review the pipeline trace in the output header if you want to see which skills and context layers were applied, or expand the assembled prompt for debugging.
6. Copy the refined prompt from the right pane into Claude, ChatGPT, Cursor, or any other tool.

### Browser AI and GitHub setup

- Browser AI uses WebGPU in the current browser and downloads the selected model the first time you run it.
- GitHub repo import is optional. To enable it locally, create a GitHub OAuth App with device flow enabled and set `VITE_GITHUB_CLIENT_ID` for the web app before starting Vite.

### A/B comparison

Click **A/B** to reveal a second model selector, then click **A/B ✦** to run both models in parallel and compare side by side.

For repo-context comparison, click **RyFine both** to run the same prompt with and without repo context.

### Product page

[ryfine.app/about](https://ryfine.app/about) — a concise overview of what RyFine does, how it works under the hood, and its data and safety guarantees.

[ryfine.app/guides](https://ryfine.app/guides) — tutorial scripts, printable workflow guides, and infographic assets for sharing RyFine’s refinement workflow.

Guide pages expose downloadable PDFs at `/media/pdfs/*.pdf`, and tutorial pages include shot-by-shot recording checklists alongside the approved script.

## Development

### Prerequisites

- Node.js 24.x and npm — [nodejs.org](https://nodejs.org/)

```bash
node -v   # should be 24.x
npm -v
```

### Get the source

```bash
git clone https://github.com/nickhilster/ryfine.git
cd ryfine
npm install
```

### Run the web app locally

```bash
npm --prefix web run dev
```

Open `http://localhost:5173`.

### Run the product page (Astro) locally

```bash
npm --prefix site run dev
```

Open `http://localhost:4321`.

### Export guide PDFs

```bash
npm --prefix site run export:guides
```

This workflow builds the Astro pages, serves `web/dist` locally, and prints each `/guides/<slug>/` page to PDF via Playwright. The exported files are written to `site/public/media/pdfs/` for source control and mirrored into `web/dist/media/pdfs/` for immediate preview.

### Build the browser extension

```bash
npm run build:extension
npm run build:extension:firefox
```

Chrome and Firefox bundles are written to `extension/.output/chrome-mv3/` and `extension/.output/firefox-mv3/`.

To produce distributable zip files:

```bash
npm --prefix extension run pack
npm --prefix extension run pack:firefox
```

The zip artifacts are written to `extension/.output/`.

### Build everything

```bash
npm run build
```

This runs `build:web` (React → `web/dist/`), `build:site` (Astro → `web/dist/about/`), and `build:extension` (browser extension → `extension/.output/chrome-mv3/`).

### Vercel deployment

`vercel.json` at the repo root wires up the full deployment:

- **Install**: root workspace deps
- **Build**: `npm run build` (web, site, then extension)
- **Output**: `web/dist/`
- **Routing**: `/about` → Astro product page; everything else → React SPA

### Browser QA report

The web package includes a Playwright harness that validates the browser UI against a local mock Ollama-compatible SSE server.

Core validation commands:

```bash
npm run build
npm run lint
npm --prefix web run test
npm --prefix web run test:browser:report
```

Install Chromium once:

```bash
npm --prefix web run test:browser:install
```

Generate a fresh report:

```bash
npm --prefix web run test:browser:report
```

Artifacts are written to `web/test-results/browser-report/`. No real provider credentials are required.

## License

[MIT](LICENSE)
