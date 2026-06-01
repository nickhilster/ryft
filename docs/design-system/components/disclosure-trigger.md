# Component: Disclosure Trigger

Pill-shaped button in the command bar that opens a panel drawer. Communicates active state, item count, and open/closed status.

---

## Anatomy

```
[ label ]              — default
[ label • ]            — .has-indicator (active content, e.g. Rules with text)
[ label  3 ]           — trigger-badge (count, e.g. Context with 3 files)
[ label ] (lime ring)  — .is-open (panel currently open)
```

---

## States

| State | Class | Visual |
|---|---|---|
| Default | — | Transparent, `--border`, `--text` label |
| Hover | — | `--surface-2` fill, `--text-h` label |
| Open | `.is-open` | `--accent-bg` fill, `--accent-border` border, `--accent` label |
| Has content | `.has-indicator` | Shows `.trigger-dot` alongside label |
| Has count | — | Shows `.trigger-badge` alongside label |

---

## Props

| Prop | Type | Purpose |
|---|---|---|
| `aria-expanded` | `boolean` | Communicates open/closed to screen readers |
| `aria-label` | `string` | Describes which panel it controls |

---

## Indicator types

**Dot** — presence without a count (e.g. "Rules are set"):
```tsx
<button className={`disclosure-trigger ${rulesActive ? 'has-indicator' : ''}`}>
  Rules
  {rulesActive && <span className="trigger-dot" aria-hidden="true" />}
</button>
```

**Badge** — numeric count (e.g. "3 context files included"):
```tsx
<button className="disclosure-trigger">
  Context
  {count > 0 && <span className="trigger-badge">{count}</span>}
</button>
```

---

## Code example

```tsx
<button
  type="button"
  className={`disclosure-trigger ${openPanel === 'rules' ? 'is-open' : ''} ${rulesActive ? 'has-indicator' : ''}`}
  aria-label="Boost rules"
  aria-expanded={openPanel === 'rules'}
  onClick={() => setOpenPanel(prev => prev === 'rules' ? null : 'rules')}
>
  Rules
  {rulesActive && <span className="trigger-dot" aria-hidden="true" />}
</button>
```

---

## Tokens used

- `--border`, `--border-strong`
- `--surface-2`
- `--text`, `--text-h`
- `--accent`, `--accent-bg`, `--accent-border`, `--accent-glow`
- `--sans` (font-family)
