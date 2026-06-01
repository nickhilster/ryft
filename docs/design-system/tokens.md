# Design Tokens — Voltage Instrument Deck

Source of truth: `web/src/index.css`

RyFine ships dark-first with a full light theme switchable via `data-theme="light"` on `:root`, or automatically via `prefers-color-scheme`.

---

## Surfaces

Used for layered backgrounds. Each step is slightly lighter/warmer in dark mode.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0a0a0c` | `#f6f6f2` | Page background, deepest layer |
| `--surface` | `#131319` | `#ffffff` | Card, drawer, modal backgrounds |
| `--surface-2` | `#1b1b23` | `#efefe8` | Raised elements inside a surface |
| `--code-bg` | `#15151b` | `#ecece4` | Code blocks, pre elements |

**Pattern:** `--bg` → `--surface` → `--surface-2` is the standard stacking order. Never skip layers.

---

## Borders

| Token | Dark | Light | Use |
|---|---|---|---|
| `--border` | `#26262f` | `#dededa` | Default border on components |
| `--border-strong` | `#383844` | `#cacac4` | Emphasised borders, focus rings, active panels |

---

## Text

| Token | Dark | Light | Use |
|---|---|---|---|
| `--text` | `#8b8b99` | `#5c5c66` | Body copy, labels, secondary content |
| `--text-h` | `#f4f4f6` | `#14141a` | Headings, primary content, interactive labels |

**Rule:** Use `--text-h` for anything the user must read to take an action. Use `--text` for supporting copy.

---

## Brand Accent

The accent is electric lime in dark mode and deep olive in light mode. All accent variants are derived from the same base hue.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--accent` | `#c8f750` | `#4c7a00` | Primary CTA, active states, highlights |
| `--accent-soft` | `#d9ff7a` | `#5f9400` | Hover states on accent elements |
| `--accent-ink` | `#0c1003` | `#ffffff` | Text/icon on accent background |
| `--accent-bg` | `rgba(200,247,80,0.10)` | `rgba(76,122,0,0.10)` | Tinted background for active/selected states |
| `--accent-border` | `rgba(200,247,80,0.38)` | `rgba(76,122,0,0.38)` | Border on active/selected components |
| `--accent-glow` | `rgba(200,247,80,0.45)` | `rgba(76,122,0,0.30)` | Drop-shadow and box-shadow glow effects |

---

## Semantic Colours

Status colours. These do not shift between themes — they stay perceptually consistent.

| Token | Value | Use |
|---|---|---|
| `--ok` | `#46d98a` | Success, connected, healthy, free tier |
| `--warn` | `#f5b73c` | Warning, approaching limits, attention needed |
| `--danger` | `#ff5d5d` | Error, destructive action, disconnected |
| `--info` | `#5cc8ff` | Informational, paid tier, neutral status |

### Alpha variants (recommended addition — see audit)

These are currently written inline as rgba literals. Defining them as tokens makes theme maintenance safe.

```css
--ok-bg:       rgba(70, 217, 138, 0.08);
--ok-border:   rgba(70, 217, 138, 0.30);
--warn-bg:     rgba(245, 183, 60, 0.08);
--warn-border: rgba(245, 183, 60, 0.30);
--danger-bg:   rgba(255, 93, 93, 0.08);
--danger-border: rgba(255, 93, 93, 0.30);
--info-bg:     rgba(92, 200, 255, 0.08);
--info-border: rgba(92, 200, 255, 0.30);
```

---

## Typography

| Token | Value | Use |
|---|---|---|
| `--display` | `'Bricolage Grotesque', system-ui, sans-serif` | Headings, logo, CTA buttons, pane titles |
| `--sans` | `'Hanken Grotesk', system-ui, 'Segoe UI', sans-serif` | Body copy, labels, form inputs |
| `--mono` | `'Geist Mono', ui-monospace, 'Cascadia Code', Consolas, monospace` | Code, prompts, token counts, technical values |

**Base size:** `15px` at `:root`. Components deviate down to `11px` for metadata.

### Type scale in use (not tokenised — candidates for future tokens)

| Size | Usage |
|---|---|
| `11px` | Uppercase labels, metadata chips, trace label |
| `12px` | Secondary text, notes, hints |
| `13px` | Form inputs, ghost buttons, list items |
| `14px` | Primary body, markdown output, card text |
| `15px` | Base (inherited from `:root`) |
| `16px` | Drawer titles, modal headings |
| `18px` | Logo wordmark, CTA buttons |

---

## Selection

```css
::selection {
  background: var(--accent-glow);
  color: var(--accent-ink);
}
```

Selected text uses the accent glow as background — brand-consistent and readable.
