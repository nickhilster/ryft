# Component: Chip / Badge

Small inline labels used for metadata, status, counts, and context indicators. Three distinct families.

---

## Families

### 1. Compare chip — `.compare-chip`

Monospace metadata shown on refinement results: duration, token count, character count.

| Modifier | Colour | Use |
|---|---|---|
| Default | `--text` on `--surface-2` | Duration, char count, line count |
| `.accent` | `--accent` on `--accent-bg` | Positive delta, "selected" state |
| `.token-chip` | `--accent` on `--accent-bg` | Token count (always accent) |

```tsx
<span className="compare-chip">1.4 s</span>
<span className="compare-chip token-chip" title="320 prompt + 180 completion">
  500 tokens
</span>
```

### 2. Trigger badge — `.trigger-badge`

Count badge overlaid on disclosure trigger buttons (Rules, Context, Library, Skills).

- Filled with `--accent`, white text
- Fixed height `17px`, min-width `17px`
- Rendered inside `.disclosure-trigger`

```tsx
<button className="disclosure-trigger">
  Context
  {count > 0 && <span className="trigger-badge">{count}</span>}
</button>
```

### 3. Trigger dot — `.trigger-dot`

Presence indicator on a disclosure trigger — "something is active here". Smaller than the badge, no number.

```tsx
<button className="disclosure-trigger has-indicator">
  Rules
  <span className="trigger-dot" aria-hidden="true" />
</button>
```

### 4. Pipeline trace chips — `.trace-chip`

Context chips in the pipeline trace strip showing which layers were applied.

| Modifier | Colour | Use |
|---|---|---|
| `.skill-chip` | `--accent` on `--accent-bg` | Built-in skill name (e.g. "Coding") |
| `.skill-chip-uncertain` | Same + dashed border + 0.75 opacity | Auto skill when classifier confidence is medium/low |
| `.user-skill-chip` | `--info` on info-bg | User-defined skill name |
| `.context-chip` | `--ok` on ok-bg | Repo context present |
| `.rules-chip` | `--text` on `--surface-2` | Custom rules present |
| `.fewshot-chip` | `--text` on `--surface-2` | Project few-shot examples present |

### 5. Quality score chip — `.quality-score`

Compact score chip in the output pane header.

| Modifier | Colour | Use |
|---|---|---|
| `.score-high` | `--ok` | Score ≥ 75 |
| `.score-mid` | `--warn` | Score 50–74 |
| `.score-low` | `--danger` | Score < 50 |

### 6. Status indicator dots

Small coloured dots used in the provider chip and connection indicators.

| Class | Colour |
|---|---|
| `.provider-chip-dot.tier-free` | `--ok` (green glow) |
| `.provider-chip-dot.tier-paid` | `--info` (blue glow) |
| `.connection-light.status-active` | `--ok` |
| `.connection-light.status-inactive` | `--danger` |
| `.connection-light.status-checking` | `--warn` (pulsing) |
| `.connection-light.status-ready` | `--info` |

---

## States

Most chips are static. Exceptions:
- `.connection-light.status-checking` — pulses with `connection-pulse` keyframe
- `.trigger-dot` — inherits glow from `--accent-glow`
- `.skill-chip-uncertain` — dashed border, reduced opacity

---

## Accessibility

- Decorative dots use `aria-hidden="true"`
- `.trigger-badge` count is read by screen readers as part of the button label
- `.trace-chip` elements have no interactive role — they are display only

---

## Tokens used

- `--accent`, `--accent-bg`, `--accent-border`, `--accent-ink`
- `--ok`, `--warn`, `--danger`, `--info`
- `--surface-2`, `--border`
- `--text`, `--text-h`
- `--mono` (compare-chip, quality-score font-family)
