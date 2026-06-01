import { useEffect, useState } from "react";
import "./SeedOfLifeLogo.css";

export type SolMode =
  | "idle" // barely-there CCW drift  — waiting, alive
  | "thinking" // faster CCW wave         — has input, ready
  | "burst" // radial centre→out       — transformation igniting
  | "working" // fast CW sweep           — streaming output back
  | "done" // one-shot outward ripple — result settled
  | "error" // outside-in implosion    — something went wrong
  | "compare"; // dual CCW + CW streams   — weighing two results

const R = 20;
const CX = 50;
const CY = 50;
const H = R * (Math.sqrt(3) / 2); // ≈ 17.32

// Index 0 = centre; 1–6 = outer ring, starting right, counter-clockwise
const CIRCLES = [
  { cx: CX, cy: CY, outer: false, ring: -1 },
  { cx: CX + R, cy: CY, outer: true, ring: 0 }, // right        (3 o'clock)
  { cx: CX + R / 2, cy: CY - H, outer: true, ring: 1 }, // upper-right  (1 o'clock)
  { cx: CX - R / 2, cy: CY - H, outer: true, ring: 2 }, // upper-left   (11 o'clock)
  { cx: CX - R, cy: CY, outer: true, ring: 3 }, // left         (9 o'clock)
  { cx: CX - R / 2, cy: CY + H, outer: true, ring: 4 }, // lower-left   (7 o'clock)
  { cx: CX + R / 2, cy: CY + H, outer: true, ring: 5 }, // lower-right  (5 o'clock)
];

const FORM_DELAYS = [0, 150, 290, 430, 570, 710, 850]; // ms
const FORM_DONE = 850 + 500 + 100; // ms until last circle finishes

const IDLE_PERIOD = 6400; // slow meditative CCW
const THINK_PERIOD = 2400; // energised CCW
const WORK_PERIOD = 1200; // fast CW

// Clockwise index: right(0)→lower-right(5)→lower-left(4)→left(3)→upper-left(2)→upper-right(1)
const cwIndex = (ring: number) => (ring <= 0 ? 0 : 6 - ring);

type Phase = "forming" | SolMode;

interface SeedOfLifeLogoProps {
  size?: number;
  mode?: SolMode;
  className?: string;
}

export function SeedOfLifeLogo({
  size = 28,
  mode = "idle",
  className = "",
}: SeedOfLifeLogoProps) {
  const [isForming, setIsForming] = useState(true);
  const phase: Phase = isForming ? "forming" : mode;

  // Transition forming → active after all circles have appeared
  useEffect(() => {
    const t = setTimeout(() => setIsForming(false), FORM_DONE);
    return () => clearTimeout(t);
  }, []);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={`sol-icon sol-phase-${phase} ${className}`}
    >
      {CIRCLES.map(({ cx, cy, outer, ring }, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={R}
          data-ring={ring >= 0 ? ring : undefined}
          className={`sol-circle ${outer ? "sol-outer" : "sol-center"}`}
          style={
            {
              // Formation
              "--sol-form-delay": `${FORM_DELAYS[i]}ms`,
              // CCW delays (idle + thinking + compare even-rings)
              "--sol-idle-delay": `${ring >= 0 ? ring * (IDLE_PERIOD / 6) : 0}ms`,
              "--sol-think-delay": `${ring >= 0 ? ring * (THINK_PERIOD / 6) : 0}ms`,
              // CW delays  (working + compare odd-rings)
              "--sol-work-delay": `${ring >= 0 ? cwIndex(ring) * (WORK_PERIOD / 6) : 0}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </svg>
  );
}

// ── Prime-rhythm periods (ms) — incommensurable values so the pattern
//    never repeats in human-observable time.
//    Centre intentionally uses same period as circle 1 but breathes inversely.
const CP_PERIODS = [3100, 3100, 3700, 4100, 4700, 3400, 2300];
const CP_DELAYS  = [  0,   500, 1100,  800,  300, 1500,  700];

/** Large centerpiece for the empty output pane.
 *  Appears fully-formed (no formation animation) and transitions to
 *  its mode immediately, since it may mount/unmount on every new boost.
 *  Animation language: prime-rhythm per-circle breathing + slow rotation. */
export function SeedOfLifeCenterpiece({
  size = 140,
  mode = "idle",
  className = "",
}: {
  size?: number;
  mode?: SolMode;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={`sol-icon sol-centerpiece sol-phase-${mode} ${className}`}
    >
      {CIRCLES.map(({ cx, cy, outer, ring }, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={R}
          data-ring={ring >= 0 ? ring : undefined}
          className={`sol-circle ${outer ? "sol-outer" : "sol-center"}`}
          style={{
            "--cp-period":      `${CP_PERIODS[i]}ms`,
            "--cp-delay":       `${CP_DELAYS[i]}ms`,
            // CW delays reused for error/working fallback
            "--sol-work-delay": `${ring >= 0 ? cwIndex(ring) * (1400 / 6) : 0}ms`,
          } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}

/** Static version — no JS, no animation. Uses currentColor for stroke. */
export function SeedOfLifeStatic({
  size = 28,
  strokeWidth = 2.4,
  className = "",
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={`sol-icon ${className}`}
    >
      {CIRCLES.map(({ cx, cy }, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          opacity={0.82}
        />
      ))}
    </svg>
  );
}
