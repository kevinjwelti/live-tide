/** One slow sheet. Run up, rest on the shore, then drain. */
export const WASH_RUN_MS = 7000;
export const WASH_PAUSE_MS = 1600;
export const WASH_DRAIN_MS = 9000;
export const WASH_REST_MS = 2400;
export const WASH_CYCLE_MS = WASH_RUN_MS + WASH_PAUSE_MS + WASH_DRAIN_MS + WASH_REST_MS;

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Where the single wash is in its cycle.
 * Reach 1 meets the shoreline. Foam is only near that edge. Reach never leaves 0..1.
 */
export function washState(elapsedMs) {
  const cycle = WASH_CYCLE_MS;
  const t = ((elapsedMs % cycle) + cycle) % cycle;
  const pauseAt = WASH_RUN_MS;
  const drainAt = pauseAt + WASH_PAUSE_MS;
  const restAt = drainAt + WASH_DRAIN_MS;
  if (t < pauseAt) {
    const reach = smoothstep(t / WASH_RUN_MS);
    const foam = reach > 0.78 ? smoothstep((reach - 0.78) / 0.22) : 0;
    return { reach, foam, wet: 0.35 + reach * 0.4, phase: "run" };
  }
  if (t < drainAt) {
    return { reach: 1, foam: 1, wet: 0.85, phase: "pause" };
  }
  if (t < restAt) {
    const u = (t - drainAt) / WASH_DRAIN_MS;
    const reach = 1 - smoothstep(u);
    const foam = reach > 0.88 ? (reach - 0.88) / 0.12 : 0;
    return { reach, foam, wet: 1, phase: "drain" };
  }
  return { reach: 0, foam: 0, wet: 0.7, phase: "rest" };
}

/**
 * Pixels the wash front sits below the shoreline.
 * Reach 1 meets the line. The result is never negative, so the front cannot cross above it.
 */
export function washDropPx(reach, depth) {
  const climbed = Math.max(0, Math.min(1, reach));
  return (1 - climbed) * Math.max(0, depth);
}
