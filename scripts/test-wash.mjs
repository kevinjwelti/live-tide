#!/usr/bin/env node
import {
  WASH_CYCLE_MS,
  WASH_DRAIN_MS,
  WASH_PAUSE_MS,
  WASH_REST_MS,
  WASH_RUN_MS,
  washDropPx,
  washState,
} from "../src/wash.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(WASH_RUN_MS >= 6000 && WASH_RUN_MS <= 8000, "the run-up takes about six to eight seconds");
assert(WASH_DRAIN_MS >= 8000 && WASH_DRAIN_MS <= 10000, "the drain takes about eight to ten seconds");
assert(WASH_PAUSE_MS > 0 && WASH_PAUSE_MS < 3000, "the sheet pauses briefly on the shore");
assert(
  WASH_CYCLE_MS === WASH_RUN_MS + WASH_PAUSE_MS + WASH_DRAIN_MS + WASH_REST_MS,
  "the cycle is run, pause, drain, and rest"
);
assert(WASH_CYCLE_MS >= 18000 && WASH_CYCLE_MS <= 24000, "one wash takes about twenty seconds");

const start = washState(0);
assert(start.phase === "run" && start.reach === 0 && start.foam === 0, "a wash begins at rest below the beach");

let prev = -1;
for (let ms = 200; ms <= WASH_RUN_MS; ms += 200) {
  const reach = washState(ms).reach;
  assert(reach + 1e-9 >= prev, "the sheet climbs smoothly");
  prev = reach;
}
const arrived = washState(WASH_RUN_MS - 1);
assert(arrived.reach > 0.98 && arrived.phase === "run", "the run-up meets the shoreline");

const held = washState(WASH_RUN_MS + WASH_PAUSE_MS / 2);
assert(held.phase === "pause" && held.reach === 1 && held.foam === 1, "the sheet pauses on the line");

prev = 2;
const drainStart = WASH_RUN_MS + WASH_PAUSE_MS;
for (let ms = drainStart + 200; ms <= drainStart + WASH_DRAIN_MS; ms += 200) {
  const reach = washState(ms).reach;
  assert(reach <= prev + 1e-9, "the sheet drains smoothly");
  prev = reach;
}
const drained = washState(drainStart + WASH_DRAIN_MS - 1);
assert(drained.phase === "drain" && drained.reach < 0.02, "the drain returns to the foot of the beach");

const resting = washState(drainStart + WASH_DRAIN_MS + 400);
assert(resting.phase === "rest" && resting.reach === 0 && resting.foam === 0, "only the wet band remains between washes");
assert(washState(WASH_CYCLE_MS).phase === "run", "the next sheet starts after the rest");

const early = washState(WASH_RUN_MS * 0.4);
assert(early.foam === 0 && early.reach < 0.8, "foam stays hidden until the sheet is near the line");
assert(washState(WASH_RUN_MS * 0.95).foam > 0, "foam appears as the sheet arrives");

for (let ms = 0; ms <= WASH_CYCLE_MS; ms += 250) {
  const state = washState(ms);
  assert(state.reach >= 0 && state.reach <= 1, "the sheet never crosses the shoreline");
  assert(state.foam >= 0 && state.foam <= 1, "foam stays in range");
  assert(washDropPx(state.reach, 300) >= 0, "the front stays on or below the line");
}

assert(washDropPx(1, 240) === 0, "a wash that has arrived sits on the shoreline");
assert(washDropPx(0, 240) === 240, "a wash at rest is the full depth below the line");
assert(washDropPx(1.4, 50) === 0, "an over-reached wash is clamped to the line");
assert(washDropPx(-0.2, 50) === 50, "a negative reach stays at the bottom");

console.log("wash tests passed");
