#!/usr/bin/env node
import { fromHarmonics } from "../src/corinto-harmonics.js";
import {
  assertForecastCoverage,
  boomDayBounds,
  coverageReport,
  ensureForecastCoverage,
} from "../src/tide-coverage.js";
import { setPlace } from "../src/time.js";

setPlace({ tz: "America/Managua", lat: 12.635, lon: -87.361 });

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const midday = Date.parse("2026-09-13T12:12:00-06:00");
const staleFetch = Date.parse("2026-09-08T12:30:41-06:00");
const bounds = boomDayBounds(midday);

const staleSeries = [];
for (let t = staleFetch - 36 * 3600000; t <= staleFetch + 120 * 3600000; t += 3600000) {
  staleSeries.push({ t, v: 3 });
}

const staleReport = coverageReport(staleSeries, midday);
assert(!staleReport.ok, "Sep 8 now+120h window must fail coverage at Sep 13 midday");
assert(
  staleReport.last < bounds.tomorrowEnd,
  "stale last point must be before end of tomorrow"
);
assert(
  staleReport.last - midday < 2 * 3600000,
  "stale series should die near the playhead (~local noon)"
);

let threw = false;
try {
  assertForecastCoverage(staleSeries, midday);
} catch {
  threw = true;
}
assert(threw, "assertForecastCoverage must fail a noon-truncated file");

const filled = ensureForecastCoverage({ series: staleSeries, extrema: [] }, midday);
const filledReport = coverageReport(filled.series, midday);
assert(filled.filled, "short file should be extended with harmonics");
assert(filledReport.ok, "extended file must cover today through end of tomorrow");
assert(
  filled.series[filled.series.length - 1].t >= bounds.tomorrowEnd,
  "extended last point must reach end of tomorrow"
);
assert(
  filled.series.some((p) => p.t > midday + 6 * 3600000),
  "extended curve must have evening points after the playhead"
);

const live = fromHarmonics(midday);
const liveReport = coverageReport(live.series, midday);
assert(liveReport.ok, "calendar harmonics at midday must cover through tomorrow");
assert(
  live.series[0].t <= bounds.todayStart,
  "harmonics must include the start of today"
);
assert(
  live.series[live.series.length - 1].t >= bounds.generateEnd - 3600000,
  "harmonics must run several days past tomorrow"
);

const oldNow = fromHarmonics(staleFetch);
const oldNowAtMidday = coverageReport(oldNow.series, midday);
assert(
  oldNowAtMidday.ok,
  "harmonics generated on Sep 8 must still cover Sep 13–14 (calendar week, not +120h)"
);

assertForecastCoverage(live.series, midday);
console.log("tide coverage tests passed");
