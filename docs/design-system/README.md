# Voltage Instrument Deck — Design System

RyFine's design system. Dark-first, electric lime accent, technical grid aesthetic.

---

## Documents

| File | Contents |
|---|---|
| [`audit.md`](./audit.md) | Full system audit — score, token coverage, hardcoded values, priority actions |
| [`tokens.md`](./tokens.md) | All 21 CSS custom properties with semantic meaning and usage rules |
| [`motion.md`](./motion.md) | Complete animation vocabulary — keyframes, easing, timing, directional semantics |

## Component docs

| File | Component |
|---|---|
| [`components/button.md`](./components/button.md) | 5 button variants, all states, sizes, code examples |
| [`components/chip.md`](./components/chip.md) | Compare chip, trigger badge, trace chips, status dots |
| [`components/drawer.md`](./components/drawer.md) | Slide-in panels, scrim, header/body structure |
| [`components/disclosure-trigger.md`](./components/disclosure-trigger.md) | Command bar panel triggers with dot and badge indicators |
| [`components/seed-of-life-logo.md`](./components/seed-of-life-logo.md) | Brand mark SVG with 8 animation phases |
| [`components/pane.md`](./components/pane.md) | Two-pane workspace, divider conduit, mobile tabs |

---

## Quick reference

```css
/* Surfaces */
--bg  --surface  --surface-2  --code-bg

/* Text */
--text  --text-h

/* Borders */
--border  --border-strong

/* Brand accent (lime / olive) */
--accent  --accent-soft  --accent-ink
--accent-bg  --accent-border  --accent-glow

/* Semantic */
--ok  --warn  --danger  --info

/* Fonts */
--display   /* Bricolage Grotesque — headings, CTAs */
--sans      /* Hanken Grotesk — body */
--mono      /* Geist Mono — code, prompts, values */
```

---

## Top priority actions (from audit)

1. **Add alpha token variants** for semantic colours (`--ok-bg`, `--warn-border`, etc.) — replaces ~35 hardcoded rgba values in App.css
2. **`aria-label` on icon-only buttons** — `.btn-ghost` instances that have no text label
3. **Focus trap in drawers** — keyboard users cannot currently be contained inside open panels
