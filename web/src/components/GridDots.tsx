import { useEffect, useRef } from "react";

// Grid cell size — must match the background-size in App.css (.app::before)
const GRID = 64;
const ACCENT = "200, 247, 80"; // var(--accent) as RGB components
const SPRITE_SIZE = 14;
const HALF_SPRITE = SPRITE_SIZE / 2;

const DX = [1, 0, -1, 0]; // direction vectors: right, down, left, up
const DY = [0, 1, 0, -1];

interface Dot {
  gx: number; // grid column index  (pixel x = gx * GRID)
  gy: number; // grid row index     (pixel y = gy * GRID)
  dir: number; // 0..3
  progress: number; // 0..1 along current GRID-length segment
  speed: number; // grid cells per second
  alpha: number; // current rendered opacity
  targetAlpha: number; // opacity we're easing toward
}

interface MotionProfile {
  count: number;
  speed: number;
  alpha: number;
  tail: number;
}

interface GridDotsProps {
  active: boolean;
  hasInput: boolean;
  isMobile: boolean;
}

function getMotionProfile(
  active: boolean,
  hasInput: boolean,
  isMobile: boolean,
): MotionProfile {
  if (active) {
    return isMobile
      ? { count: 4, speed: 0.9, alpha: 0.22, tail: 10 }
      : { count: 6, speed: 1.05, alpha: 0.27, tail: 12 };
  }

  if (hasInput) {
    return isMobile
      ? { count: 2, speed: 0.56, alpha: 0.16, tail: 8 }
      : { count: 3, speed: 0.64, alpha: 0.2, tail: 10 };
  }

  return isMobile
    ? { count: 1, speed: 0.32, alpha: 0.1, tail: 6 }
    : { count: 1, speed: 0.4, alpha: 0.13, tail: 8 };
}

function spawnDot(cols: number, rows: number, profile: MotionProfile): Dot {
  return {
    gx: Math.floor(Math.random() * cols),
    gy: Math.floor(Math.random() * rows),
    dir: Math.floor(Math.random() * 4),
    progress: Math.random(), // stagger so they don't all turn at the same time
    speed: profile.speed * (0.75 + Math.random() * 0.5),
    alpha: 0,
    targetAlpha: profile.alpha * (0.6 + Math.random() * 0.7),
  };
}

function pickDir(current: number): number {
  const r = Math.random();
  if (r < 0.58) return current; // continue straight
  if (r < 0.78) return (current + 1) % 4; // turn right
  if (r < 0.93) return (current + 3) % 4; // turn left
  return (current + 2) % 4; // reverse (rare)
}

// Build a glow sprite once — radial gradient on a 20×20 offscreen canvas.
// drawImage is ~0.01 ms per call, so this is essentially free per frame.
function buildSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const ctx = c.getContext("2d")!;
  const center = SPRITE_SIZE / 2;
  const g = ctx.createRadialGradient(center, center, 0, center, center, center);
  g.addColorStop(0, `rgba(${ACCENT}, 1)`);
  g.addColorStop(0.28, `rgba(${ACCENT}, 0.55)`);
  g.addColorStop(1, `rgba(${ACCENT}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return c;
}

export function GridDots({ active, hasInput, isMobile }: GridDotsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ active, hasInput, isMobile });

  useEffect(() => {
    stateRef.current = { active, hasInput, isMobile };
  }, [active, hasInput, isMobile]);

  useEffect(() => {
    // Honour the user's motion preference — no animation at all if reduced
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const canvasElement = canvas;
    const context = ctx;

    const sprite = buildSprite();
    let raf = 0;
    let t0 = performance.now();
    let dots: Dot[] = [];

    function resize() {
      // Use the parent's dimensions — canvas.offsetWidth reports its intrinsic
      // size (300×150), not the CSS-stretched size from inset:0.
      const parent = canvasElement.parentElement;
      canvasElement.width = Math.round(
        parent ? parent.clientWidth : window.innerWidth,
      );
      canvasElement.height = Math.round(
        parent ? parent.clientHeight : window.innerHeight,
      );
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvasElement.parentElement ?? canvasElement);

    const cols = () => Math.ceil(canvasElement.width / GRID) + 1;
    const rows = () => Math.ceil(canvasElement.height / GRID) + 1;

    const initialProfile = getMotionProfile(
      stateRef.current.active,
      stateRef.current.hasInput,
      stateRef.current.isMobile,
    );
    dots.push(spawnDot(cols(), rows(), initialProfile));

    function frame(t: number) {
      const dt = Math.min((t - t0) / 1000, 0.05); // max 50 ms step
      t0 = t;
      raf = requestAnimationFrame(frame);

      if (document.hidden) return; // pause when tab is not visible

      const profile = getMotionProfile(
        stateRef.current.active,
        stateRef.current.hasInput,
        stateRef.current.isMobile,
      );
      const targetCount = profile.count;
      const c = cols();
      const r = rows();

      // Progressively spawn new dots when active
      while (dots.length < targetCount) {
        dots.push(spawnDot(c, r, profile));
      }

      // Update all dots
      for (const dot of dots) {
        dot.progress += dot.speed * dt;
        // Ease opacity toward target
        dot.alpha += (dot.targetAlpha - dot.alpha) * Math.min(dt * 4, 1);

        if (dot.progress >= 1) {
          dot.progress -= 1;
          // Advance to next intersection, wrapping at edges
          dot.gx = (((dot.gx + DX[dot.dir]) % c) + c) % c;
          dot.gy = (((dot.gy + DY[dot.dir]) % r) + r) % r;
          dot.dir = pickDir(dot.dir);
          // Vary speed and brightness slightly per segment for organic feel
          dot.speed = profile.speed * (0.75 + Math.random() * 0.5);
          dot.targetAlpha = profile.alpha * (0.6 + Math.random() * 0.7);
        }
      }

      // Fade out and cull excess dots
      if (dots.length > targetCount) {
        for (let i = targetCount; i < dots.length; i++) {
          dots[i].targetAlpha = 0;
        }
        dots = dots.filter((d, i) => i < targetCount || d.alpha > 0.005);
      }

      // Render
      context.clearRect(0, 0, canvasElement.width, canvasElement.height);
      for (const dot of dots) {
        if (dot.alpha < 0.005) continue;
        const x = (dot.gx + DX[dot.dir] * dot.progress) * GRID;
        const y = (dot.gy + DY[dot.dir] * dot.progress) * GRID;
        const trailLength = profile.tail;
        const trailAlpha = Math.min(dot.alpha * 0.55, 0.14);

        context.globalAlpha = 1;
        context.strokeStyle = `rgba(${ACCENT}, ${trailAlpha})`;
        context.lineWidth = 1.2;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(
          x - DX[dot.dir] * trailLength,
          y - DY[dot.dir] * trailLength,
        );
        context.lineTo(x + DX[dot.dir] * 2, y + DY[dot.dir] * 2);
        context.stroke();

        context.globalAlpha = Math.min(dot.alpha * 1.1 + 0.02, 0.42);
        context.drawImage(sprite, x - HALF_SPRITE, y - HALF_SPRITE);
      }
      context.globalAlpha = 1;
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        // Above all content so dots show through opaque cards/panes.
        // mix-blend-mode: screen adds light to dark backgrounds without
        // obscuring UI content — on dark (#0a0a0c) the dot color shows
        // through; on bright areas the effect is negligible.
        zIndex: 100,
        opacity: isMobile ? 0.8 : 1,
        pointerEvents: "none",
        mixBlendMode: "screen",
        willChange: "contents",
      }}
    />
  );
}
