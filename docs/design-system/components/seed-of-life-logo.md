# Component: SeedOfLifeLogo

The RyFine brand mark. A Seed of Life geometry (7 overlapping circles) with a rich animation state system that communicates application state through motion.

Source: `web/src/components/SeedOfLifeLogo.tsx` + `web/src/components/SeedOfLifeLogo.css`

---

## Motion philosophy

Direction carries semantic meaning:

| Direction | Meaning |
|---|---|
| Counter-clockwise (↺) | Gathering, receiving — input side |
| Clockwise (↻) | Releasing, giving back — output side |
| Radial outward | Transformation moment |
| Radial inward | Collapse / error |

This is not decoration — it is a communication layer. The logo tells the user what the system is doing.

---

## Animation phases

| Phase (`SolMode`) | Trigger | Visual behaviour |
|---|---|---|
| `forming` | First render | Each circle springs from its own centre, staggered 150ms apart |
| `idle` | No input, no output | Barely-there CCW wave, meditative. "Waiting, alive, unhurried." |
| `thinking` | Input is non-empty, ready to boost | Faster CCW wave. "Something is here. Use me." |
| `working` | Streaming (LLM responding) | Fast CW sweep, stroke widens on active circles. "Giving back." |
| `burst` | *(planned for flash of completion)* | Dramatic radial outward expansion, then settles |
| `done` | Stream completed | Single outward pulse, settles to warm glow |
| `error` | Error state | Outside-in implosion, icon turns `--danger` red |
| `compare` | A/B compare mode active | Two interleaved streams — odd rings CW, even rings CCW. Visual "weighing" |

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `size` | `number` | `24` | Width and height in px |
| `mode` | `SolMode` | `'idle'` | Animation phase |
| `className` | `string` | `undefined` | Additional CSS classes |

```ts
export type SolMode = 'idle' | 'thinking' | 'working' | 'burst' | 'done' | 'error' | 'compare';
```

---

## Sizes in use

| Location | Size | Mode logic |
|---|---|---|
| Command bar logo | `20px` | `idle` → `thinking` (has input) → `working` (streaming) |
| Boost button | `18px` | `thinking` (can boost) → `working` (loading) |
| Adjust button | `14px` | `idle` → `thinking` → `working` |
| Output pane centerpiece | `140px` | Same phase as app state, prime-rhythm breathing |

---

## Centerpiece variant

At large sizes (`sol-centerpiece` class), the logo uses a different animation language:
- **Idle:** 60s full rotation + individual circle prime-rhythm breathing (each circle has its own incommensurable period — the pattern never repeats in human-observable time)
- **Thinking:** Faster rotation (36s) + sped-up breathing
- **Burst:** Dramatic radial pulse, no rotation
- The centre and outer circles breathe *inversely* for depth — geometry "breathes" as one organism

---

## Accessibility

- Always rendered with `aria-hidden="true"` — the logo is decorative; application state is communicated via other means
- Respects `prefers-reduced-motion`: all animations disabled, circles settle to `opacity: 0.82`

---

## Button context

When `.sol-icon` is inside `.btn-boost`, it inherits the button's ink colour (`--accent-ink`) and drops its own glow filter:

```css
.btn-boost .sol-icon { color: var(--accent-ink); filter: none; }
.btn-boost:disabled .sol-icon { opacity: 0.45; }
```

---

## Code example

```tsx
import { SeedOfLifeLogo, type SolMode } from './components/SeedOfLifeLogo';

// Derive mode from app state
const mode: SolMode = isLoading ? 'working' : input.trim() ? 'thinking' : 'idle';

<SeedOfLifeLogo size={20} mode={mode} />
```

---

## Tokens used

- `--accent` (default stroke colour via `currentColor`)
- `--accent-glow` (drop-shadow on working/done/burst states)
- `--accent-ink` (when inside `.btn-boost`)
- `--danger` (error state)
- CSS custom properties: `--sol-form-delay`, `--sol-idle-delay`, `--sol-think-delay`, `--sol-work-delay`, `--cp-period`, `--cp-delay` (set programmatically per circle in the TSX component)
