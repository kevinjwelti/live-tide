#!/usr/bin/env node
import {
  SHORE_ABOVE_LIMIT_PX,
  SHORE_CLIMB_MAX_PX,
  shoreBreathReach,
  shoreEdge,
  shoreFoamCover,
  shoreFoamWidth,
  shoreLace,
  shoreNightFade,
  shorePalette,
} from "../src/shore.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(shoreBreathReach(-Math.PI / 2) < 0.001, "the edge sits on the tide line at the bottom of the breath");
assert(Math.abs(shoreBreathReach(Math.PI / 2) - 1) < 0.001, "the edge is fully up at the top of the breath");
assert(shoreBreathReach(0) > 0.45 && shoreBreathReach(0) < 0.55, "mid-breath is halfway up the sand");

const lineY = 400;
let maxAbove = 0;
for (let step = 0; step <= 32; step += 1) {
  const phase = (step / 32) * Math.PI * 2;
  for (let i = 0; i <= 24; i += 1) {
    const edge = shoreEdge(lineY, i / 24, step * 0.4, phase);
    const above = lineY - edge.y;
    if (above > maxAbove) maxAbove = above;
    assert(above <= SHORE_ABOVE_LIMIT_PX + 0.01, "foam stays within a few pixels of the tide line");
    assert(edge.climb <= SHORE_CLIMB_MAX_PX + 0.01, "the breath climb stays capped");
    assert(edge.cover >= 0 && edge.cover <= 1, "lace coverage stays in range");
  }
}
assert(maxAbove > 8, "the breath does travel up the sand");

const laces = [0, 0.15, 0.4, 0.7].map((u) => shoreLace(u, 1));
assert(new Set(laces.map((n) => n.toFixed(3))).size > 2, "the foam edge is irregular along the shore");
assert(shoreFoamCover(-1, 0) === 0, "low lace leaves a gap instead of a solid stripe");
assert(shoreFoamCover(1, 0) > 0.8, "high lace is a bright fleck");
assert(shoreFoamWidth(1, 1) < shoreFoamWidth(1, 0), "the lace spreads thinner at the top of the breath");

const day = shorePalette("day");
const dusk = shorePalette("dusk");
assert(day.deep !== dusk.deep, "dusk keeps its own warm water");
assert(shorePalette("night").sand === day.sand, "after dark the beach palette is not used");
assert(shorePalette("other").sand === day.sand, "unknown scenes use the day beach");
assert(shoreNightFade(0) === 1, "daylight keeps the full beach");
assert(shoreNightFade(0.22) === 1, "the fade waits until the sky is actually darkening");
assert(shoreNightFade(1) === 0, "a starry night drops the beach");
assert(shoreNightFade(0.42) > 0.2 && shoreNightFade(0.42) < 0.8, "late dusk is a partial fade");
assert(shoreNightFade(0.3) > shoreNightFade(0.5), "the beach thins as the night deepens");

console.log("shore tests passed");
