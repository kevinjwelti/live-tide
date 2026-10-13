/** One breath is one set: three washes that fall short, then one that meets the shore. */
export const WASH_SLOTS = [
  { start: 0, end: 0.28, reach: 0.46 },
  { start: 0.22, end: 0.5, reach: 0.62 },
  { start: 0.44, end: 0.72, reach: 0.78 },
  { start: 0.62, end: 1, reach: 1 },
];

const RISE = 0.55;

export function washUnit(phase) {
  const tau = Math.PI * 2;
  return (((phase % tau) + tau) % tau) / tau;
}

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** 0 outside the window. Rises through the first 55% of the window, then recedes. */
export function washProgress(unit, slot) {
  if (unit < slot.start || unit > slot.end) return 0;
  const span = slot.end - slot.start;
  if (span <= 0) return 0;
  const u = (unit - slot.start) / span;
  if (u <= RISE) return smoothstep(u / RISE);
  return smoothstep(1 - (u - RISE) / (1 - RISE));
}

/** How far this wash has climbed, as a fraction of the water column. Never past the slot. */
export function washReach(unit, slot) {
  return washProgress(unit, slot) * slot.reach;
}

/**
 * Pixels the wash front sits below the shoreline.
 * Reach 1 meets the line. The result is never negative, so the front cannot cross above it.
 */
export function washDropPx(reach, depth) {
  const climbed = Math.max(0, Math.min(1, reach));
  return (1 - climbed) * Math.max(0, depth);
}
