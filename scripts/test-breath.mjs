#!/usr/bin/env node
import {
  breathAmplitudePx,
  breathLight,
  breathPeriodMs,
  breathSwell,
  tideBreathLevel,
} from "../src/breath.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(breathPeriodMs(1) > breathPeriodMs(0), "high water breathes slower than low water");
assert(Math.abs(breathPeriodMs(0.5) - 11000) < 1, "mid tide is about an eleven second breath");
assert(breathPeriodMs(0) === 8000, "low water is an eight second breath");
assert(breathPeriodMs(1) === 14000, "high water is a fourteen second breath");

assert(breathAmplitudePx(1) > breathAmplitudePx(0), "high water swells fuller than low water");
assert(breathSwell(0, 0.4) === 0, "the turn of the breath is still");
assert(Math.abs(breathSwell(Math.PI, 1)) < 1e-6, "the settle returns to the tide line");
assert(Math.abs(breathSwell(Math.PI / 2, 1) - breathAmplitudePx(1)) < 1e-9, "inhale reaches the amplitude");
assert(Math.abs(breathSwell(Math.PI * 1.5, 0)) <= breathAmplitudePx(0) + 1e-9, "swell stays inside the amplitude");

const rising = breathLight(Math.PI / 2, true);
const falling = breathLight(Math.PI / 2, false);
const exhaled = breathLight(Math.PI * 1.5, true);
assert(rising > falling, "a rising tide brightens the light");
assert(rising > exhaled, "inhale is brighter than the settle");
assert(rising <= 1 && exhaled >= 0, "light stays in range");

assert(tideBreathLevel(5, 1, 5) === 1, "high water is full");
assert(tideBreathLevel(1, 1, 5) === 0, "low water is shallow");
assert(tideBreathLevel(3, 1, 5) === 0.5, "mid water is half");
assert(tideBreathLevel(9, 4, 4) === 0.5, "a flat tide stays calm");

console.log("breath tests passed");
