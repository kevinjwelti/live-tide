/**
 * Boom / America/Managua coverage rules: today through end of tomorrow
 * must always be present so midday never blanks the future curve.
 */
import { addZonedDays, startOfZonedDay } from "./time.js";
import { fromHarmonics, harmonicRange } from "./corinto-harmonics.js";

/** Exclusive end of the required window: start of the day after tomorrow. */
export const REQUIRED_AHEAD_DAYS = 2;

export function boomDayBounds(now = Date.now()) {
  const todayStart = startOfZonedDay(new Date(now));
  const generate = harmonicRange(now);
  return {
    todayStart: todayStart.getTime(),
    yesterdayStart: generate.start,
    tomorrowEnd: addZonedDays(todayStart, REQUIRED_AHEAD_DAYS).getTime(),
    generateEnd: generate.end,
  };
}

export function coverageReport(series = [], now = Date.now()) {
  const bounds = boomDayBounds(now);
  const first = series[0]?.t ?? 0;
  const last = series[series.length - 1]?.t ?? 0;
  const coversStart = first > 0 && first <= bounds.todayStart + 3 * 3600000;
  const coversEnd = last >= bounds.tomorrowEnd;
  return {
    ...bounds,
    first,
    last,
    coversStart,
    coversEnd,
    ok: coversStart && coversEnd,
  };
}

export function assertForecastCoverage(series, now = Date.now()) {
  const report = coverageReport(series, now);
  if (report.ok) return report;
  const lastIso = report.last ? new Date(report.last).toISOString() : "empty";
  const needIso = new Date(report.tomorrowEnd).toISOString();
  throw new Error(
    `Tide coverage must reach end of tomorrow (${needIso}); series ends ${lastIso}`
  );
}

function mergeExtrema(primary = [], extra = []) {
  if (!primary.length) return extra;
  if (!extra.length) return primary;
  const first = primary[0].t;
  const last = primary[primary.length - 1].t;
  const before = extra.filter((e) => e.t < first - 30 * 60000);
  const after = extra.filter((e) => e.t > last + 30 * 60000);
  return [...before, ...primary, ...after].sort((a, b) => a.t - b.t);
}

function extendSeries(existing = [], extra = []) {
  if (!existing.length) return extra;
  if (!extra.length) return existing;
  const first = existing[0].t;
  const last = existing[existing.length - 1].t;
  const before = extra.filter((p) => p.t < first - 30 * 60000);
  const after = extra.filter((p) => p.t > last + 30 * 60000);
  return [...before, ...existing, ...after];
}

/**
 * Prefer a fresh file when it already covers today→tomorrow.
 * If the file is short or entirely in the past, replace it with a new
 * rolling harmonics window so the chart cannot go stale.
 */
export function ensureForecastCoverage(parsed = {}, now = Date.now()) {
  const series = parsed.series ?? [];
  const extrema = parsed.extrema ?? [];
  const report = coverageReport(series, now);
  const { todayStart, yesterdayStart, generateEnd } = boomDayBounds(now);
  const last = series[series.length - 1]?.t ?? 0;
  const fileIsPast = last > 0 && last < todayStart;
  const spansWindow =
    report.ok &&
    !fileIsPast &&
    (series[0]?.t ?? Infinity) <= yesterdayStart + 3600000 &&
    last >= generateEnd - 3600000;
  if (spansWindow) {
    return { ...parsed, series, extrema, filled: false };
  }
  if (fileIsPast || !series.length) {
    const fresh = fromHarmonics(now);
    assertForecastCoverage(fresh.series, now);
    return { ...parsed, ...fresh, filled: true, source: "harmonics" };
  }
  const extra = fromHarmonics(now, { start: yesterdayStart, end: generateEnd });
  const merged = {
    ...parsed,
    series: extendSeries(series, extra.series),
    extrema: mergeExtrema(extrema, extra.extrema),
    filled: true,
  };
  assertForecastCoverage(merged.series, now);
  return merged;
}

/** Always-valid Boom curve for the current local calendar window. */
export function rollingTide(now = Date.now(), overlay = null) {
  return ensureForecastCoverage(overlay ?? fromHarmonics(now), now);
}
