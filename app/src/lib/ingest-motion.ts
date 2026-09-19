// The dissolve's timing, in one place. Flights run as Web Animations on transform + opacity only,
// so the compositor keeps them smooth even when the main thread is busy rendering the feed.

export const STAGGER_MS = 45; // between one row lifting and the next
export const LIFT_MS = 120; // the outline rising off the page (translate-y -8px, scale 1.02)
export const FLIGHT_MS = 300; // bbox -> feed slot
export const PAGE_SETTLE_MS = 320; // a new page is on screen this long before its rows lift
export const OUTLINES_LEAD_MS = 420; // outlines are drawn this long before the first lift
export const ROW_H = 40; // FeedRow height (DESIGN.md)
export const MAX_ANIMATED = 60; // flights + fading rows alive at once (the rest waits / is virtual)

/**
 * A damped spring (stiffness 380, damping 32, mass 1: zeta 0.82, 1.1% overshoot, within 2% by
 * 252 ms) sampled into CSS `linear()`, so a WAAPI animation follows the real spring curve on the
 * compositor. At 300 ms it sits 1% past the target; the last fifth of the curve is eased onto
 * exactly 1 so a long flight does not snap 8px when it lands.
 */
export function springEasing(stiffness = 380, damping = 32, mass = 1, durationMs = FLIGHT_MS, samples = 48): string {
  const dt = 0.0002;
  const steps = Math.round(durationMs / 1000 / dt);
  const every = Math.max(1, Math.floor(steps / samples));
  const raw: number[] = [];
  let x = 0;
  let v = 0;
  for (let i = 0; i <= steps; i++) {
    if (i % every === 0) raw.push(x);
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
  }
  const tail = raw[raw.length - 1];
  const points = raw.map((value, i) => {
    const f = i / (raw.length - 1);
    const blend = f <= 0.8 ? 0 : ((f - 0.8) / 0.2) ** 2 * (3 - 2 * ((f - 0.8) / 0.2)); // smoothstep
    return value + (1 - tail) * blend;
  });
  points[points.length - 1] = 1;
  return `linear(${points.map((p) => +p.toFixed(4)).join(", ")})`;
}

let cached: string | null = null;
/** The flight easing, or a close cubic-bezier where `linear()` is not supported. */
export function flightEasing(): string {
  if (cached) return cached;
  const supported = typeof CSS !== "undefined" && CSS.supports?.("animation-timing-function", "linear(0, 1)");
  cached = supported ? springEasing() : "cubic-bezier(0.22, 1, 0.36, 1)";
  return cached;
}

export const LIFT_EASING = "cubic-bezier(0.2, 0, 0, 1)";
