/** Aerial beach preview. The tide line is the shore. Foam only creeps a few pixels onto the sand. */

export const SHORE_CLIMB_MAX_PX = 14;
export const SHORE_ABOVE_LIMIT_PX = 17;

const PALETTES = {
  day: {
    sand: "#e7d2a6",
    sandFar: "#f3e4c2",
    wet: "rgba(158, 112, 58, 0.4)",
    water: "#16a39a",
    shallow: "#7fe3d4",
    lip: "rgba(190, 236, 226, 0.32)",
    deep: "#0c6e72",
    foam: "255, 255, 255",
    foamGain: 1,
    swash: "rgba(132, 98, 54, 0.22)",
    caustic: "rgba(255, 255, 255, 0.075)",
  },
  dusk: {
    sand: "#e8bc86",
    sandFar: "#f0cfa0",
    wet: "rgba(146, 78, 42, 0.58)",
    water: "#1d746f",
    shallow: "#d9a07c",
    lip: "rgba(255, 220, 190, 0.42)",
    deep: "#143f4c",
    foam: "255, 246, 236",
    foamGain: 0.84,
    swash: "rgba(112, 68, 38, 0.36)",
    caustic: "rgba(255, 214, 176, 0.06)",
  },
};

export function shorePalette(scene) {
  if (scene === "dusk") return PALETTES.dusk;
  return PALETTES.day;
}

/**
 * 1 while the sun is up or in the dusk band, 0 once the sky is starry.
 * The beach fades out across the late-dusk shoulder instead of cutting off.
 */
export function shoreNightFade(night) {
  const n = Math.min(1, Math.max(0, Number(night) || 0));
  const t = Math.min(1, Math.max(0, (n - 0.22) / 0.4));
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}

/** 0 on the tide line, 1 at the top of the breath. */
export function shoreBreathReach(phase) {
  return (Math.sin(phase) + 1) / 2;
}

/** Irregular lace, about −1..1. Slow drift so the edge is not a ruler. */
export function shoreLace(u, seconds) {
  const t = seconds || 0;
  return (
    Math.sin(u * 17.2 + t * 0.09) * 0.55
    + Math.sin(u * 43.0 - t * 0.04 + 1.3) * 0.3
    + Math.sin(u * 91.0 + 0.4) * 0.15
  );
}

/** 0 where the lace breaks, up to 1 on a bright fleck. Thinner at the top of the breath. */
export function shoreFoamCover(lace, reach) {
  const n = lace * 0.5 + 0.5;
  if (n < 0.3) return 0;
  return ((n - 0.3) / 0.7) * (1 - reach * 0.35);
}

export function shoreFoamWidth(cover, reach) {
  return (1.5 + cover * 4.4) * (1 - reach * 0.42);
}

/**
 * Foam position for one point on the tide line.
 * `y` is never more than SHORE_ABOVE_LIMIT_PX above `lineY`.
 */
export function shoreEdge(lineY, u, seconds, phase) {
  const reach = shoreBreathReach(phase);
  const climb = reach * SHORE_CLIMB_MAX_PX;
  const lace = shoreLace(u, seconds);
  const spread = 1 - reach * 0.48;
  const raw = lineY - climb + lace * 8 * spread;
  const ceiling = lineY - SHORE_ABOVE_LIMIT_PX;
  return {
    y: Math.max(ceiling, raw),
    reach,
    lace,
    spread,
    climb,
    cover: shoreFoamCover(lace, reach),
  };
}
