# Motion System — Voltage Instrument Deck

RyFine's animations are not decorative — each has a specific communicative role. This document is the authoritative reference. Do not add animations without consulting it.

---

## Directional semantics (Seed of Life)

| Direction | Meaning |
|---|---|
| Counter-clockwise (↺) | Gathering, receiving — input side |
| Clockwise (↻) | Releasing, giving back — output side |
| Radial outward | Transformation moment, completion |
| Radial inward | Collapse, error, failure |

---

## App-level keyframes (`App.css`)

| Keyframe | Duration | Used by | Purpose |
|---|---|---|---|
| `deck-rise` | `0.5s` | `.command-bar`, `.pane-input`, `.pane-output` | Page-load entrance — elements rise 10px and fade in |
| `deck-fade` | `0.18s` | `.panel-scrim`, `.budget-popover` | Simple fade for overlays |
| `conduit-flow` | `1.1s` | `.divider-line.active` | Streaming indicator — lime gradient flows downward through divider |
| `bolt-flicker` | `6s` | `.logo-bolt` | Logo bolt flickers twice at 97%/99% — subtle "aliveness" |
| `loading-pulse` | `1.2s` | `.loading-dot`, `.streaming-dot` | Dot pulses from full to 0.3 opacity + scale(0.7) |
| `connection-pulse` | `1.4s` | `.connection-light.status-checking` | Status dot scales ±8% while checking |
| `conduit` | `1.8s` | `.demo-conduit` (product page) | Same flowing gradient, longer cycle |
| `cp-enter` | `0.7s` | `.output-centerpiece-wrap` | Centerpiece enters with scale(0.94→1) + fade |

---

## SeedOfLifeLogo keyframes (`SeedOfLifeLogo.css`)

| Keyframe | Phase | Description |
|---|---|---|
| `sol-form` | `forming` | Each circle springs from 0.06× scale with overshoot |
| `sol-idle-wave` | `idle` | Outer circles wave CCW at 0.38→0.72 opacity |
| `sol-idle-center` | `idle` | Centre breathes 0.42→0.65 |
| `sol-think` | `thinking` | Faster CCW wave, more contrast (0.18→1) |
| `sol-think-center` | `thinking` | Centre breathes faster |
| `sol-burst-center` | `burst` | Centre flashes 0→1→0 in 2s |
| `sol-burst-outer` | `burst` | Outer ring follows 320ms later |
| `sol-work` | `working` | CW sweep, stroke widens on peak (2.4→3.4) |
| `sol-work-center` | `working` | Centre pulses faster (0.7s) |
| `sol-done-center` | `done` | One pulse then holds warm (0.82) |
| `sol-done-outer` | `done` | Follows 280ms later, holds at 0.72 |
| `sol-error-outer` | `error` | Outer dims first (outside-in collapse) |
| `sol-error-center` | `error` | Centre collapses after outer |
| `sol-compare` | `compare` | Odd rings CW, even rings CCW — visual "weighing" |
| `cp-rotate` | Centerpiece | 60s (idle) / 36s (thinking) full rotation |
| `cp-outer` | Centerpiece | Prime-rhythm breathing via `--cp-period` |
| `cp-center` | Centerpiece | Inversely breathes relative to outer circles |

---

## Easing vocabulary

| Curve | Value | Use |
|---|---|---|
| Spring entry | `cubic-bezier(0.22, 1, 0.36, 1)` | Page load, drawer open, centerpiece appear |
| Spring overshoot | `cubic-bezier(0.22, 1.4, 0.36, 1)` | Circle formation (overshoot to 1.08× then settle) |
| Ease in-out | `ease-in-out` | Breathing, pulsing, all continuous animations |
| Ease out | `ease-out` | Done state — one-shot settle |
| Linear | `linear` | Rotation (must be uniform) |

---

## Timing scale

| Duration | Use |
|---|---|
| `0.1s` | Micro-interactions (button press scale) |
| `0.15–0.2s` | State transitions (colour, background, border) |
| `0.26s` | Drawer open/close |
| `0.5s` | Page-load entrance |
| `0.7s` | Centerpiece appear, circle formation |
| `1.1–1.5s` | Streaming indicators |
| `2.0–2.4s` | SeedOfLife continuous phases |
| `60s` | Centerpiece idle rotation |

---

## Reduced motion

All animations respect `prefers-reduced-motion: reduce`. In `App.css` the affected elements are listed explicitly. In `SeedOfLifeLogo.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .sol-circle { animation: none !important; opacity: 0.82 !important; }
  .sol-centerpiece { animation: none !important; }
}
```

**Rule:** Every new animation must have a `prefers-reduced-motion` fallback.
