# Design System Audit — Voltage Instrument Deck

**Score: 81 / 100** — Strong token foundation, excellent motion system, one recurring maintenance pattern to address.

---

## Summary

| Area | Status | Score |
|---|---|---|
| Token definition | Comprehensive, both themes | 95/100 |
| Token usage | Good — one class of exceptions | 75/100 |
| Component completeness | All major components covered | 85/100 |
| Naming consistency | Consistent BEM-light convention | 88/100 |
| Motion system | Exceptional — directional meaning | 95/100 |
| Accessibility | Partial — ARIA present, not systematic | 60/100 |
| Documentation | Absent before this audit | 0/100 → now remediated |

---

## Token Coverage

### Defined tokens (`web/src/index.css`)

| Token | Dark value | Light value | Category |
|---|---|---|---|
| `--bg` | `#0a0a0c` | `#f6f6f2` | Surface |
| `--surface` | `#131319` | `#ffffff` | Surface |
| `--surface-2` | `#1b1b23` | `#efefe8` | Surface |
| `--code-bg` | `#15151b` | `#ecece4` | Surface |
| `--border` | `#26262f` | `#dededa` | Border |
| `--border-strong` | `#383844` | `#cacac4` | Border |
| `--text` | `#8b8b99` | `#5c5c66` | Text |
| `--text-h` | `#f4f4f6` | `#14141a` | Text |
| `--accent` | `#c8f750` | `#4c7a00` | Brand accent |
| `--accent-soft` | `#d9ff7a` | `#5f9400` | Brand accent |
| `--accent-ink` | `#0c1003` | `#ffffff` | Brand accent |
| `--accent-bg` | `rgba(200,247,80,0.10)` | `rgba(76,122,0,0.10)` | Brand accent |
| `--accent-border` | `rgba(200,247,80,0.38)` | `rgba(76,122,0,0.38)` | Brand accent |
| `--accent-glow` | `rgba(200,247,80,0.45)` | `rgba(76,122,0,0.30)` | Brand accent |
| `--ok` | `#46d98a` | *(same)* | Semantic |
| `--warn` | `#f5b73c` | *(same)* | Semantic |
| `--danger` | `#ff5d5d` | *(same)* | Semantic |
| `--info` | `#5cc8ff` | *(same)* | Semantic |
| `--display` | `'Bricolage Grotesque'` | *(same)* | Typography |
| `--sans` | `'Hanken Grotesk'` | *(same)* | Typography |
| `--mono` | `'Geist Mono'` | *(same)* | Typography |

### Hardcoded values found (maintenance risk)

The semantic colours (`--ok`, `--warn`, `--danger`, `--info`) are used throughout `App.css` as raw `rgba()` values with various opacities — for tinted backgrounds and borders on status chips, warning cards, and budget indicators. These are not wrong, but they create a maintenance burden: changing `--ok` would require finding ~10 rgba occurrences.

**Recommendation:** extend the token set with alpha variants:

```css
--ok-bg:      rgba(70, 217, 138, 0.08);
--ok-border:  rgba(70, 217, 138, 0.30);
--warn-bg:    rgba(245, 183, 60, 0.08);
--warn-border:rgba(245, 183, 60, 0.30);
--danger-bg:  rgba(255, 93, 93, 0.08);
--danger-border: rgba(255, 93, 93, 0.30);
--info-bg:    rgba(92, 200, 255, 0.08);
--info-border:rgba(92, 200, 255, 0.30);
```

**Count:** ~35 hardcoded rgba instances in App.css. One `#000` used in a mask (intentional — not a colour token).

---

## Component Completeness

| Component | Variants | States | A11y | Docs |
|---|---|---|---|---|
| Button (boost) | 1 | hover, disabled, active | ❌ no aria-label | ✅ |
| Button (ghost) | 1 + small | hover, disabled, is-active | ❌ | ✅ |
| Button (primary) | 1 | hover | ❌ | ✅ |
| Button (cancel) | 1 | hover | ❌ | ✅ |
| Button (remove) | 1 + small | hover, confirming | ❌ | ✅ |
| Chip / badge | 5 variants | accent modifier | ⚠️ partial | ✅ |
| Disclosure trigger | 1 | is-open, has-indicator | ✅ aria-expanded | ✅ |
| Provider chip | 1 | is-open, hover | ✅ aria-label | ✅ |
| Drawer | left + right | is-open | ✅ aria-hidden, aria-label | ✅ |
| Pane | input + output | — | ⚠️ partial | ✅ |
| Pipeline trace | 1 | expanded | ✅ aria-label | ✅ |
| Command palette | 1 | focused item | ✅ role=dialog | ✅ |
| SeedOfLifeLogo | 1 | 8 animation phases | ✅ aria-hidden | ✅ |
| AgentSelector | 1 | focus-within | ✅ label | ✅ |
| QualityScore | score-high/mid/low | — | ✅ aria-label | ✅ |

---

## Naming Consistency

Convention used: **flat BEM-lite** — block name prefixed (`.btn-`, `.drawer-`, `.pane-`), no double-underscores. Modifiers use `-` separator or separate class (`.is-open`, `.has-indicator`).

✅ Consistent across all components.

One exception: `.sol-*` uses its own namespace for the Seed of Life logo — intentional, keeps the logo portable.

---

## Motion System

**Exceptional.** The motion system has documented directional semantics:

| Direction | Meaning |
|---|---|
| Counter-clockwise (↺) | Gathering, receiving (input side) |
| Clockwise (↻) | Releasing, giving back (output side) |
| Radial outward | Transformation moment |
| Radial inward | Collapse / error |

App-level keyframes: `deck-rise`, `deck-fade`, `conduit-flow`, `bolt-flicker`, `loading-pulse`, `connection-pulse`, `conduit`.

SeedOfLifeLogo phases: `forming`, `idle`, `thinking`, `working`, `burst`, `done`, `error`, `compare`.

---

## Priority Actions

1. **Add alpha token variants for semantic colours** (--ok-bg, --warn-bg, etc.) — replaces ~35 hardcoded rgba values, makes theme changes reliable
2. **Add explicit `aria-label` to `.btn-boost`, `.btn-ghost`** where they carry icon-only content
3. **Document the motion system** in a `motion.md` file — the directional semantics are sophisticated and need to survive developer turnover
