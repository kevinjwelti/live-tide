#!/usr/bin/env node
import { forecastDays, forecastLabel, FORECAST_DAYS } from "../src/forecast.js";
import { addZonedDays, setPlace, startOfZonedDay } from "../src/time.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

setPlace({ tz: "America/Los_Angeles", lat: 34.01, lon: -118.5 });

const now = new Date("2026-06-15T19:00:00Z");
const origin = startOfZonedDay(now);
const day0 = origin.getTime();
const day1 = addZonedDays(origin, 1).getTime();
const day2 = addZonedDays(origin, 2).getTime();

const days = forecastDays(
  [
    { t: day0 + 7 * 3600000, v: 1.25, type: "L" },
    { t: day0 + 14 * 3600000, v: 6.1, type: "H" },
    { t: day1 - 1, v: 0.4, type: "L" },
    { t: day1, v: 5.5, type: "H" },
    { t: day2 + 3 * 3600000, v: 2.2, type: "L" },
    { t: Number.NaN, v: 9, type: "H" },
  ],
  now
);

assert(days.length === FORECAST_DAYS, "a forecast is seven days");
assert(days[0].today === true && days[1].today === false, "the first day is today");
assert(days[0].turns.length === 3, "turns before the next midnight stay on today");
assert(days[0].turns[0].type === "L" && days[0].turns[0].v === 1.25, "the first turn keeps its height");
assert(days[0].turns[2].t === day1 - 1, "a turn one millisecond before midnight stays today");
assert(days[1].turns.length === 1 && days[1].turns[0].v === 5.5, "midnight opens the next day");
assert(days[2].turns.length === 1 && days[2].turns[0].type === "L", "a later day keeps its own turns");
assert(days[3].turns.length === 0, "a day with no turns is still listed");
assert(days.every((day, i) => day.end === days[i + 1]?.start || i === days.length - 1), "the days meet");
assert(days[6].end === addZonedDays(origin, 7).getTime(), "the week ends seven midnights ahead");

const label = forecastLabel(day0);
assert(/monday/i.test(label.dow), "the weekday follows the beach clock");
assert(/jun/i.test(label.dom) && /15/.test(label.dom), "the date follows the beach clock");

const empty = forecastDays([], now);
assert(empty.length === 7 && empty.every((day) => day.turns.length === 0), "an empty tide still has seven days");

console.log("forecast tests passed");
