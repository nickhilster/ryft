# Ryft — Design Spec

**Date:** 2026-06-01
**Status:** Approved

---

## What is Ryft?

Ryft is a prompt injection detection product for developers building AI systems. It analyses prompts and context documents before they reach an LLM, surfaces suspicious patterns with plain-English explanations, and offers sanitized rewrites.

The primary user is a developer constructing system prompts, importing `.md` skill files, or pulling context from docs and repos — someone who wants to know: "does any of this content try to hijack my LLM?"

---

## Product Surfaces

| Surface | Description | Tier |
|---|---|---|
| `npm install ryft` | Layer 1 static analysis SDK | Free, MIT |
| `ryft.dev/api` | Layer 2 hosted semantic API | Usage-based |
| `ryft.dev` | Web playground (forked from ryfine) | Free tier + paid |
| Dashboard | Audit logs, team rules, volume analytics | Team subscription |

Ryfine becomes the first integration: analysis runs before the refinement call. This doubles as the live product demo.

---

## Architecture

### Layer 1 — Static Analysis (OSS SDK)

Runs entirely client-side. No network call, no latency, no cost.

**Detects:**
- Direct injection: "ignore previous instructions", "disregard your system prompt"
- Persona / role-play hijacks: "you are now DAN", "pretend you have no restrictions"
- Structural abuse: nested instruction blocks, delimiter tricks (`###SYSTEM###`, XML tag injection)
- Encoding obfuscation: base64, leetspeak, unicode homoglyphs, reversed text
- Context poisoning: injected instructions embedded in imported `.md`, `.json`, `.txt` files

**Finding shape:**
```ts
interface Finding {
  type: 'instruction_override' | 'persona_hijack' | 'encoding_obfuscation' | 'structural_abuse' | 'context_poisoning';
  severity: 'critical' | 'high' | 'medium' | 'low';
  segment: string;
  startIndex: number;
  endIndex: number;
  explanation: string;
}
```

### Layer 2 — Semantic Analysis (Hosted API)

Called when Layer 1 flags something, or on-demand for deep analysis.

**Handles what rules cannot:**
- Semantic obfuscation — the "poetry trick": instructions disguised as metaphor, narrative, or creative text
- Cross-segment correlation — harmless fragments that combine into an attack
- Novel patterns not yet in the static rule library
- Culturally-loaded or ambiguous language used to smuggle intent

**Implementation:** embedding comparison against a curated attack library, with an LLM-as-judge pass for novel patterns. The sanitized rewrite is a natural output of this layer.

---

## Full Analysis Response

```ts
interface RyftAnalysis {
  risk: 'critical' | 'high' | 'medium' | 'low' | 'clean';
  score: number;                // 0–1
  findings: Finding[];
  sanitized: string;            // cleaned version of the input
  sanitizationChanges: string[]; // human-readable list of what changed
  layer: 1 | 2;                 // which layer produced this result
}
```

---

## Detection Taxonomy

| Category | Examples | Layer |
|---|---|---|
| Direct injection | "ignore previous instructions" | 1 |
| Persona hijack | "you are now DAN" | 1 |
| Structural abuse | nested `[SYSTEM]` blocks, XML injection | 1 |
| Encoding tricks | base64, leetspeak, unicode homoglyphs | 1 |
| Context poisoning | injected instructions in `.md`/`.json` imports | 1 |
| Semantic obfuscation | poetry, metaphor, narrative disguise | 2 |
| Novel patterns | unknown creative attacks | 2 |
| Cross-segment correlation | harmless fragments that combine into an attack | 2 |

---

## Monetisation

- **Layer 1 SDK** — free, open source (MIT). Community contributes patterns.
- **Layer 2 API** — usage-based pricing, generous free tier for individuals.
- **Dashboard** — team plan, monthly subscription. Audit logs, custom rules, SSO.
- **Enterprise** — custom SLAs, self-hosted Layer 2 (future), compliance exports.

---

## Out of Scope (v1)

- Real-time streaming analysis
- Multi-modal injection (image, audio)
- Fine-tuned local models
- Self-hosted Layer 2
