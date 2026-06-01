# Component: Button

Five button variants covering the full action hierarchy, from primary CTA to destructive removal.

---

## Variants

| Class | Purpose | Visual weight |
|---|---|---|
| `.btn-boost` | Primary CTA — "RyFine ✦", "A/B ✦" | Filled, accent background, glow |
| `.btn-primary` | Confirming actions — "Save", "Create" | Filled, accent background, no glow |
| `.btn-ghost` | Secondary actions — "Copy", "Paste", "Clear" | Outlined, transparent background |
| `.btn-cancel` | Interrupt in-progress actions — "Stop" | Outlined, danger colour |
| `.btn-remove` | Destructive removal — "Delete", "Remove" | Ghost, turns danger on hover |

---

## States

### `.btn-boost`

| State | Visual |
|---|---|
| Default | Accent fill (`--accent`), lime glow shadow |
| Hover | Stronger glow (`box-shadow: 0 0 32px var(--accent-glow)`) |
| Active (`:active`) | Scales down slightly (`transform: scale(0.97)`) |
| Disabled | `opacity: 0.35`, no glow, `cursor: not-allowed` |

### `.btn-ghost`

| State | Visual |
|---|---|
| Default | Transparent, `--border` outline, `--text` label |
| Hover | `--surface-2` fill, `--border-strong` outline, `--text-h` label |
| Disabled | `opacity: 0.3`, `cursor: not-allowed` |
| `.is-active` | `--accent-bg` fill, `--accent-border` outline, `--accent` label |

### `.btn-remove`

| State | Visual |
|---|---|
| Default | Transparent, `opacity: 0.6` |
| Hover | `--danger` border and text, `opacity: 1` |
| `.confirming` | Danger fill + border — "are you sure?" state |

---

## Sizes

| Modifier | Padding | Font size | Use |
|---|---|---|---|
| Default | `10px 24px` (boost) / `7px 13px` (ghost) | `14px` (boost) / `13px` (ghost) | Standard actions |
| `.small` | `4px 10px` | `12px` | Actions inside cards, drawers, headers |
| `.small-boost` | `4px 10px` | `12px` | Boost button inside list items |

---

## Accessibility

- All buttons use `<button type="button">` except submit buttons
- Submit buttons use `<button type="submit">` and rely on form `onSubmit`
- `disabled` prop passed for non-interactive states
- Icon-only buttons should add `aria-label` (currently missing on most `.btn-ghost` instances — see audit)

---

## Do's and Don'ts

| ✅ Do | ❌ Don't |
|---|---|
| Use `.btn-boost` for the one primary action per view | Use more than one `.btn-boost` on screen at once |
| Use `.small` modifier in tight contexts (card headers, chips) | Scale buttons manually with custom padding |
| Show `.confirming` state before destructive `.btn-remove` actions | Delete without two-click confirmation |
| Set `disabled` when the action is unavailable | Hide the button — disable it instead |

---

## Code example

```tsx
{/* Primary CTA */}
<button className="btn-boost" onClick={boost} disabled={!canBoost}>
  RyFine ✦
</button>

{/* Secondary */}
<button className="btn-ghost" onClick={clear} disabled={!hasContent}>
  Clear
</button>

{/* Small variant inside a card */}
<button className="btn-ghost small" onClick={() => copyText(output, 'header')}>
  {copied ? 'Copied!' : 'Copy'}
</button>

{/* Delete with confirmation */}
<button
  className={`btn-remove small ${confirming ? 'confirming' : ''}`}
  onClick={handleDeleteClick}
>
  {confirming ? 'Confirm?' : 'Delete'}
</button>
```

---

## Tokens used

- `--accent`, `--accent-ink`, `--accent-border`, `--accent-bg`, `--accent-glow`
- `--border`, `--border-strong`
- `--surface-2`
- `--text`, `--text-h`
- `--danger`
- `--display` (font-family on `.btn-boost`)
- `--sans` (font-family on `.btn-ghost`, `.btn-primary`)
