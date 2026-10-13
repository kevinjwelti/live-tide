#!/usr/bin/env node
import { WASH_SLOTS, washDropPx, washReach, washUnit } from "../src/wash.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const small = WASH_SLOTS.slice(0, 3);
const setWave = WASH_SLOTS[3];

assert(WASH_SLOTS.length === 4, "a set is three short washes and one that meets the line");
assert(small.every((slot) => slot.reach < 1), "the early washes are not allowed to reach the shoreline");
assert(setWave.reach === 1, "the last wash of the set is the one that meets the line");

for (const slot of WASH_SLOTS) {
  const crest = slot.start + (slot.end - slot.start) * 0.55;
  const peak = washReach(crest, slot);
  assert(Math.abs(peak - slot.reach) < 1e-6, "each wash crests at its own reach");
  assert(washReach(slot.start - 0.01, slot) === 0, "a wash is still before its window");
  assert(washReach(slot.end + 0.02, slot) === 0, "a wash has gone after its window");
  assert(washReach(slot.start, slot) === 0, "a wash starts at rest");
  let prev = -1;
  for (let i = 1; i <= 16; i += 1) {
    const unit = slot.start + ((crest - slot.start) * i) / 16;
    const reach = washReach(unit, slot);
    assert(reach + 1e-9 >= prev, "a wash rises smoothly toward its crest");
    prev = reach;
  }
  for (let i = 0; i <= 40; i += 1) {
    const reach = washReach(i / 40, slot);
    assert(reach >= 0 && reach <= slot.reach + 1e-9, "a wash never climbs past its slot");
  }
}

assert(Math.abs(washReach(setWave.start + (setWave.end - setWave.start) * 0.55, setWave) - 1) < 1e-6, "the set wave meets the line at its crest");
assert(small.every((slot) => washReach(slot.start + (slot.end - slot.start) * 0.55, slot) < 0.85), "smaller washes fall short");

for (let i = 0; i <= 200; i += 1) {
  const unit = i / 200;
  const active = WASH_SLOTS.filter((slot) => washReach(unit, slot) > 0).length;
  assert(active <= 2, "at most two washes overlap");
}

assert(Math.abs(washUnit(0)) < 1e-9, "a breath starts at the first wash");
assert(Math.abs(washUnit(Math.PI * 2)) < 1e-9, "the next breath starts the set over");
assert(Math.abs(washUnit(Math.PI) - 0.5) < 1e-9, "mid breath is halfway through the set");
assert(Math.abs(washUnit(-Math.PI) - 0.5) < 1e-9, "a negative phase still lands in the set");

assert(washDropPx(1, 240) === 0, "a wash that has arrived sits on the shoreline");
assert(washDropPx(0, 240) === 240, "a wash at rest is the full depth below the line");
assert(washDropPx(0.25, 80) === 60, "a quarter climb still has three quarters to go");
assert(washDropPx(1.4, 50) === 0, "an over-reached wash is clamped to the line");
assert(washDropPx(-0.2, 50) === 50, "a negative reach stays at the bottom");
assert(washDropPx(0.5, -10) === 0, "a wash cannot climb through a negative depth");

console.log("wash tests passed");
