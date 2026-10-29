/** Aerial beach preview. Foam slides a short way up the sand, then the wet sheen dries. */

export const SHORE_CLIMB_MAX_PX = 28;
export const SHORE_ABOVE_LIMIT_PX = 38;

const PALETTES = {
  day: {
    sand: "#ecd6aa",
    sandFar: "#f4e6c4",
    wet: "rgba(168, 132, 78, 0.42)",
    gloss: "rgba(255, 248, 230, 0.55)",
    water: "rgba(12, 150, 146, 0.78)",
    shallow: "rgba(186, 236, 220, 0.42)",
    mid: "rgba(24, 176, 164, 0.5)",
    deep: "rgba(8, 104, 112, 0.9)",
    foam: "255, 255, 255",
    foamGain: 1,
    swash: "rgba(150, 112, 64, 0.16)",
    caustic: "rgba(230, 255, 248, 0.16)",
    spark: "rgba(255, 255, 255, 0.55)",
  },
  dusk: {
    sand: "#e7b784",
    sandFar: "#f0cfa6",
    wet: "rgba(124, 70, 36, 0.58)",
    gloss: "rgba(255, 228, 196, 0.4)",
    water: "rgba(18, 112, 112, 0.8)",
    shallow: "rgba(214, 186, 150, 0.38)",
    mid: "rgba(28, 140, 132, 0.48)",
    deep: "rgba(14, 62, 74, 0.9)",
    foam: "255, 248, 240",
    foamGain: 0.94,
    swash: "rgba(130, 78, 42, 0.16)",
    caustic: "rgba(255, 220, 186, 0.12)",
    spark: "rgba(255, 244, 228, 0.4)",
  },
};

export function shorePalette(scene) {
  if (scene === "dusk") return PALETTES.dusk;
  return PALETTES.day;
}

/** 1 while the sun is up or in the dusk band, 0 once the sky is starry. */
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

/** Wet sand rises with the foam and dries slowly after it drains. */
export function shoreWetStep(prev, reach) {
  const current = Math.min(1, Math.max(0, Number(prev) || 0));
  const next = Math.min(1, Math.max(0, Number(reach) || 0));
  if (next >= current) return current + (next - current) * 0.4;
  return current * 0.997 + next * 0.003;
}

/** Four octaves, about −1..1. */
export function shoreOctaves(u, seconds) {
  const t = seconds || 0;
  const o1 = Math.sin(u * 5.4 + t * 0.06);
  const o2 = Math.sin(u * 12.8 - t * 0.045 + 1.3);
  const o3 = Math.sin(u * 28.0 + t * 0.1 + 0.6);
  const o4 = Math.sin(u * 63.0 - t * 0.03 + 2.2);
  return {
    n: o1 * 0.46 + o2 * 0.28 + o3 * 0.16 + o4 * 0.1,
    o1,
    o2,
    o3,
    o4,
  };
}

export function shoreLace(u, seconds) {
  return shoreOctaves(u, seconds).n;
}

export function shoreFoamCover(lace, reach) {
  const n = lace * 0.5 + 0.5;
  if (n < 0.28) return 0;
  return ((n - 0.28) / 0.72) * (1 - reach * 0.32);
}

export function shoreFoamWidth(cover, reach) {
  return (8 + cover * 22) * (1 - reach * 0.38);
}

/**
 * Crest and trailing edge of the foam sheet.
 * The crest never sits more than SHORE_ABOVE_LIMIT_PX above the tide line.
 */
export function shoreFoamShape(lineY, u, seconds, phase) {
  const reach = shoreBreathReach(phase);
  const field = shoreOctaves(u, seconds);
  const fan = 1 - reach * 0.4;
  const climb = reach * SHORE_CLIMB_MAX_PX * (0.7 + 0.3 * (field.n * 0.5 + 0.5));
  const wobble = field.o2 * 14 + field.o3 * 9 + field.o4 * 5;
  const crestRaw = lineY - climb - 6 * fan - wobble;
  const crest = Math.max(lineY - SHORE_ABOVE_LIMIT_PX, crestRaw);
  const body = (36 + (field.o1 * 0.5 + 0.5) * 40) * (0.72 + 0.28 * fan);
  const trail = crest + body + field.o3 * 12 + field.o4 * 8;
  const hole = field.o3 > 0.08 || field.o4 > 0.4;
  const filament = Math.abs(field.o4) > 0.62;
  return {
    crest,
    trail,
    body,
    reach,
    climb,
    n: field.n,
    hole,
    filament,
    cover: hole ? 0 : shoreFoamCover(field.n, reach),
  };
}

export function shoreEdge(lineY, u, seconds, phase) {
  const shape = shoreFoamShape(lineY, u, seconds, phase);
  return {
    y: shape.crest,
    reach: shape.reach,
    lace: shape.n,
    spread: 1 - shape.reach * 0.4,
    climb: shape.climb,
    cover: shape.cover,
  };
}
