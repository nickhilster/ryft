# Ryft

Prompt injection detection for developers building AI systems.

Ryft analyses prompts and context documents before they reach an LLM, surfaces suspicious patterns with plain-English explanations, and offers sanitized rewrites.

---

## How it works

**Layer 1 — Static analysis (open source)**
Runs client-side with zero latency. Catches direct injection, persona hijacks, encoding tricks, structural abuse, and context poisoning in imported files.

**Layer 2 — Semantic analysis (hosted API)**
Handles what rules can't: obfuscation through metaphor and narrative, cross-segment attacks, and novel patterns not yet in the static library.

---

## Packages

| Package | Description |
|---|---|
| `packages/core` | Core refinement pipeline (ryfine heritage) |
| `packages/sdk` | Ryft Layer 1 static analysis SDK *(coming soon)* |
| `web/` | Web playground — interactive analysis UI |
| `extension/` | Browser extension |
| `site/` | Marketing site |

---

## Development

### Prerequisites

- Node.js 24.x — [nodejs.org](https://nodejs.org/)

```bash
node -v   # should be 24.x
npm -v
```

### Get the source

```bash
git clone https://github.com/nickhilster/ryft.git
cd ryft
npm install
```

### Run the web app locally

```bash
npm --prefix web run dev
```

Open `http://localhost:5173`.

### Run the site locally

```bash
npm --prefix site run dev
```

Open `http://localhost:4321`.

### Build everything

```bash
npm run build
```

---

## Design spec

[`docs/superpowers/specs/2026-06-01-ryft-design.md`](docs/superpowers/specs/2026-06-01-ryft-design.md)

---

## Status

Early development. Forked from [ryfine](https://github.com/nickhilster/ryfine).

---

## License

[MIT](LICENSE)
