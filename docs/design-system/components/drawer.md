# Component: Drawer

Slide-in panels that overlay the main workspace. Used for Rules, Context, Library, Skills, Settings, and Project panels.

---

## Variants

| Class | Direction | Panels that use it |
|---|---|---|
| `.drawer-left` | Slides in from left | Prompt Library |
| `.drawer-right` | Slides in from right | Rules, Context, Skills, Settings, Project |
| `.drawer-settings` | Right, fixed 460px | Settings |
| `.drawer-project` | Right, fixed 360px | Project history |

---

## States

| State | Class | Visual |
|---|---|---|
| Closed | default | Off-screen (`translateX(±102%)`) |
| Open | `.is-open` | Slides to `translateX(0)` |

Left drawers use a CSS transition. Right drawers use the `drawer-in-right` keyframe animation for a spring-like entry.

```css
/* Left */
.drawer-left { transform: translateX(-102%); transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1); }
.drawer-left.is-open { transform: translateX(0); }

/* Right — plays once on mount */
@keyframes drawer-in-right { to { transform: translateX(0); } }
```

---

## Structure

Every drawer has three mandatory sections:

```tsx
<aside className="drawer drawer-right is-open" aria-label="[Panel name]">
  {/* 1. Header */}
  <header className="drawer-header">
    <div>
      <h2 className="drawer-title">[Title]</h2>
      <p className="drawer-subtitle">[Subtitle / description]</p>
    </div>
    <button className="drawer-close" type="button" aria-label="Close [panel]" onClick={onClose}>
      ×
    </button>
  </header>

  {/* 2. Scrollable body */}
  <div className="drawer-body">
    {/* content */}
  </div>
</aside>
```

The `.drawer-body` is `flex: 1; overflow-y: auto` — it scrolls independently of the header.

---

## Overlay (scrim)

A `.panel-scrim` element is rendered in the DOM when any panel is open. It:
- Covers the full viewport behind the drawer
- Has `backdrop-filter: blur(3px)` for depth
- Dismisses the drawer on click

```tsx
{openPanel && (
  <div className="panel-scrim" role="presentation" onClick={() => setOpenPanel(null)} />
)}
```

---

## Accessibility

- `<aside>` with `aria-label` on the drawer container
- `aria-hidden={openPanel !== 'rules'}` on closed drawers
- Close button has explicit `aria-label="Close [panel name]"`
- Focus is not explicitly trapped — improvement opportunity (see audit)

---

## Responsive

Below `900px`: drawers expand to `100vw`.

---

## Tokens used

- `--surface` (drawer background)
- `--border`, `--border-strong` (side border)
- `--text`, `--text-h`
- Box shadow: `0 0 80px rgba(0,0,0,0.5)`
