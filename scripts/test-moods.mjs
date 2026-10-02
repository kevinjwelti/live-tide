#!/usr/bin/env node
import { moodIdForDate, moodFromQuery, pickMood, ROTATION_IDS } from "../src/moods.js";
import { setPlace } from "../src/time.js";

setPlace({ tz: "America/Managua", lat: 12.635, lon: -87.361 });

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(ROTATION_IDS.join(",") === "ink,swiss,noir", "rotation is the first three moods");

const start = Date.parse("2026-09-01T12:00:00-06:00");
for (let i = 0; i < 40; i += 1) {
  const today = new Date(start + i * 86400000);
  const tomorrow = new Date(start + (i + 1) * 86400000);
  const a = moodIdForDate(today);
  const b = moodIdForDate(tomorrow);
  assert(ROTATION_IDS.includes(a), `${a} not in rotation`);
  assert(a !== b, `same mood two days in a row on ${today.toISOString()}: ${a}`);
}

assert(moodFromQuery("?mood=noir")?.id === "noir", "query override noir");
assert(moodFromQuery("?mood=INK")?.id === "ink", "query override is case-insensitive");
assert(pickMood(new Date("2026-09-28T17:00:00-06:00"), "?mood=swiss").id === "swiss");
assert(pickMood(new Date("2026-09-28T17:00:00-06:00"), "").id === moodIdForDate(new Date("2026-09-28T17:00:00-06:00")));

console.log("mood picker tests passed");
