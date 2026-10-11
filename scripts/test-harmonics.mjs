import assert from "node:assert/strict";
import { heightAt, predictModel } from "../src/harmonics.js";
import { NOAA_MODELS, WORLD_MODELS } from "../src/tide-models.js";

const santaMonicaHigh = Date.parse("2026-10-11T16:52:00Z");
const santa = heightAt(santaMonicaHigh, NOAA_MODELS["9410840"]);
assert.ok(Math.abs(santa - 6.05) < 0.2, `Santa Monica high ${santa}`);

const hossegor = predictModel(
  WORLD_MODELS.hossegor,
  Date.parse("2026-10-11T00:00:00Z"),
  Date.parse("2026-10-12T00:00:00Z")
);
const hossegorHigh = hossegor.extrema.find((point) => point.type === "H");
const shomHigh = Date.parse("2026-10-11T03:37:00Z");
assert.ok(
  Math.abs(hossegorHigh.t - shomHigh) < 20 * 60 * 1000,
  `Hossegor high ${new Date(hossegorHigh.t).toISOString()}`
);
assert.ok(Math.abs(hossegorHigh.v / 3.280839895 - 4.19) < 0.25, `Hossegor height ${hossegorHigh.v}`);

const ericeira = predictModel(
  WORLD_MODELS.ericeira,
  Date.parse("2026-10-11T00:00:00Z"),
  Date.parse("2026-10-12T00:00:00Z")
);
const ericeiraHigh = ericeira.extrema.find((point) => point.type === "H");
const penicheHigh = Date.parse("2026-10-11T02:42:00Z");
assert.ok(
  Math.abs(ericeiraHigh.t - penicheHigh) < 45 * 60 * 1000,
  `Ericeira high ${new Date(ericeiraHigh.t).toISOString()}`
);

console.log("harmonics ok");
