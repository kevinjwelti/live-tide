#!/usr/bin/env node
import {
  KIOSK_BURN_PX,
  KIOSK_MIDNIGHT_GRACE_SEC,
  KIOSK_UPTIME_MS,
  kioskReloadDue,
  localDayKey,
  nextRetryDelay,
  randomBurnShift,
  secondsIntoLocalDay,
  shouldKioskReload,
} from "../src/kiosk.js";
import { setPlace } from "../src/time.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

setPlace({ tz: "America/Managua", lat: 12.635, lon: -87.361 });

assert(
  shouldKioskReload({ uptimeMs: KIOSK_UPTIME_MS, dateChanged: false, secondsIntoLocalDay: 100 }) ===
    false,
  "uptime of exactly 24h does not reload"
);
assert(
  shouldKioskReload({
    uptimeMs: KIOSK_UPTIME_MS + 1,
    dateChanged: false,
    secondsIntoLocalDay: 100,
  }),
  "uptime past 24h reloads"
);
assert(
  shouldKioskReload({
    uptimeMs: 60_000,
    dateChanged: true,
    secondsIntoLocalDay: KIOSK_MIDNIGHT_GRACE_SEC - 1,
  }) === false,
  "midnight reload waits until just after midnight"
);
assert(
  shouldKioskReload({
    uptimeMs: 60_000,
    dateChanged: true,
    secondsIntoLocalDay: KIOSK_MIDNIGHT_GRACE_SEC,
  }),
  "reload at the grace second after local midnight"
);
assert(
  shouldKioskReload({ uptimeMs: 3 * 3600_000, dateChanged: true, secondsIntoLocalDay: 3 * 3600 }),
  "a missed midnight still reloads later that morning"
);
assert(
  shouldKioskReload({ uptimeMs: 3600_000, dateChanged: false, secondsIntoLocalDay: 3600 }) === false,
  "same local day under 24h stays up"
);

const beforeMidnight = new Date("2026-10-12T05:59:50Z");
const justAfter = new Date("2026-10-12T06:00:20Z");
assert(localDayKey(beforeMidnight) === "2026-10-11", "Managua date before midnight");
assert(secondsIntoLocalDay(beforeMidnight) === 23 * 3600 + 59 * 60 + 50, "seconds before midnight");
assert(localDayKey(justAfter) === "2026-10-12", "Managua date just after midnight");
assert(secondsIntoLocalDay(justAfter) === 20, "twenty seconds after midnight");
assert(kioskReloadDue(justAfter, beforeMidnight.getTime()), "crosses local midnight");
assert(
  kioskReloadDue(new Date(beforeMidnight.getTime() + 10_000), beforeMidnight.getTime()) === false,
  "still the same evening"
);
assert(
  kioskReloadDue(new Date(beforeMidnight.getTime() + KIOSK_UPTIME_MS + 1000), beforeMidnight.getTime()),
  "long uptime reloads"
);

const shift = randomBurnShift(() => 0);
assert(shift.x === -KIOSK_BURN_PX && shift.y === -KIOSK_BURN_PX, "shift stays inside -6px");
const far = randomBurnShift(() => 0.999);
assert(Math.abs(far.x) <= KIOSK_BURN_PX && Math.abs(far.y) <= KIOSK_BURN_PX, "shift stays inside +6px");
assert(Number.isInteger(far.x) && Number.isInteger(far.y), "burn-in uses whole pixels");

assert(nextRetryDelay(15_000) > 15_000, "retry backs off");
assert(nextRetryDelay(4 * 60_000) === 5 * 60_000, "retry caps at five minutes");

console.log("kiosk tests passed");
