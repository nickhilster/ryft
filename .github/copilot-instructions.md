# RyFine Copilot Instructions

## Repository Map

- `web/` — React 19 / Vite / TypeScript web app (primary user-facing product)
- `site/` — Astro product page, builds to `web/dist/about/` and deploys to `ryfine.app/about`
- `.github/prompts/` — reusable prompt files for RyFine workflows
- `.github/agents/`, `.github/instructions/`, `.github/skills/` — workspace-scoped Copilot customizations

## Preferred Agents

- Use `Prompt Builder` for prompt engineering, `.prompt.md` authoring, RyFine examples, and prompt review.
- Use `Expert React Frontend Engineer` for `web/` UI work, React patterns, and frontend tests.
- Use `Accessibility Expert` for dedicated accessibility reviews or fixes.

## Preferred Skills

- Use `prompt-optimizer` for one-off chat prompts that should be ready to paste into a chat interface.
- Use `webapp-testing` when validating the web UI or product page in a real browser.

## RyFine Workflow

- Prefer storing reusable prompts under `.github/prompts/`.

## Starter Prompts

- `boost-chat-prompt.prompt.md` — refines a rough prompt or selection through the `ryFine` tool
- `create-reusable-prompt.prompt.md` — creates or updates a reusable `.prompt.md` file with `Prompt Builder`
- `review-repo-prompt.prompt.md` — reviews or repairs an existing `.prompt.md` file

## Validation Commands

- Root: `npm run build`, `npm run lint`
- Web: `npm --prefix web run dev`, `npm --prefix web run build`, `npm --prefix web run lint`, `npm --prefix web run test`
- Site: `npm --prefix site run dev`, `npm --prefix site run build`

## Working Rules

- Keep instructions, prompts, and examples grounded in actual repository behavior.
- Do not invent commands, scripts, or file paths.
- When user-visible extension or web behavior changes, check whether `README.md` or `web/README.md` should change too.
- When the product page content changes, check whether `site/src/pages/about.astro` should be updated.
- Prefer focused validation for the surface you touched before broad checks.
