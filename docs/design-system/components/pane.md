# Component: Pane

The two-pane workspace is RyFine's primary layout. Input on the left, output on the right, connected by an energy conduit divider that animates during streaming.

---

## Structure

```
.prompt-workspace
  ├── .pane.pane-input
  │     ├── .pane-header
  │     ├── <textarea class="prompt-area" />
  │     └── .pane-footer
  │
  ├── .divider-col
  │     └── .divider-line [.active during streaming]
  │
  └── .pane.pane-output
        ├── .pane-header
        ├── .pipeline-trace [when result available]
        ├── .output-area
        └── .pane-footer [when result available]
```

---

## Pane variants

| Class | Side | Animation delay |
|---|---|---|
| `.pane-input` | Left | `deck-rise 0.08s` |
| `.pane-output` | Right | `deck-rise 0.16s` |

Both use the `deck-rise` keyframe (fade up from 10px).

---

## Pane header

```tsx
<div className="pane-header">
  <span className="pane-title">Your prompt</span>
  {inputLen > 0 && <span className="char-count">{inputLen} chars</span>}
</div>
```

- `.pane-title` — display font, `13px`, `--text-h`
- `.char-count` — mono font, `12px`, `--text` at 55% opacity

---

## Pane footer

Action toolbar. Always flex-row. Primary action (e.g. `.btn-boost`) is always rightmost.

```tsx
<div className="pane-footer">
  <div className="footer-left">
    {/* secondary actions and metadata */}
  </div>
  <button className="btn-boost">RyFine ✦</button>
</div>
```

`.footer-left` uses `margin-right: auto` to push primary actions to the right edge.

---

## Divider — the energy conduit

The divider communicates streaming state through animation:

| State | Visual |
|---|---|
| Idle | `1px solid var(--border)` |
| `.active` (streaming) | Lime gradient flows downward, `box-shadow: 0 0 12px var(--accent-glow)` |

```css
@keyframes conduit-flow {
  0%   { background-position: 0 -100%; }
  100% { background-position: 0 100%; }
}
```

The conduit is a direct visual metaphor: energy (the LLM response) travelling from input to output.

---

## Output area content states

| State | Component rendered |
|---|---|
| Empty, no loading | `.placeholder-text` — italic hint |
| Loading, no output yet | `.loading-state` — animated dot + "Starting…" / "Loading model" |
| Streaming | `.streaming-badge` — pulsing dot + "Generating" |
| Done | `.markdown-output` — rendered markdown |
| Error | `.error-msg` — `--danger` text |
| Answer detected | `.answer-warning` — amber warning card |

---

## Mobile layout

Below `720px`, the two-pane layout switches to a tab bar:

```
[ Your prompt ] [ Refined prompt ● ]
```

- `.mobile-tab-bar` — sticky tab row
- `.mobile-tab.active-tab` — `--accent` underline border
- `.tab-dot` — lime presence dot on the output tab when output is available
- Active tab content is shown; inactive is `hidden`

---

## Tokens used

- `--surface`, `--surface-2`
- `--border`, `--border-strong`
- `--text`, `--text-h`
- `--accent`, `--accent-glow`
- `--display` (pane-title)
- `--mono` (char-count, prompt-area)
