import { rollingTide } from "./tide-coverage.js";
import { fromHarmonics } from "./corinto-harmonics.js";
import { setPlace, startOfZonedDay } from "./time.js";
import { BOOM } from "./beaches.js";
import { NOAA_MODELS, SUBORDINATES } from "./tide-models.js";
import { predictModel, predictSubordinate } from "./harmonics.js";

export const STATION = BOOM;

setPlace(STATION);

export const REFRESH_MS = 30 * 60 * 1000;

const BOOM_TIDES_URL = `${import.meta.env?.BASE_URL ?? "/"}data/boom-tides.json`;

function toMs(timestamp) {
  const n = Number(timestamp);
  return n < 1e12 ? n * 1000 : n;
}

function parseSurfline(json) {
  const rows = json?.data?.tides ?? [];
  const series = rows
    .filter((row) => row.type === "NORMAL")
    .map((row) => ({ t: toMs(row.timestamp), v: Number(row.height) }))
    .sort((a, b) => a.t - b.t);
  const extrema = rows
    .filter((row) => row.type === "HIGH" || row.type === "LOW")
    .map((row) => ({
      t: toMs(row.timestamp),
      v: Number(row.height),
      type: row.type === "HIGH" ? "H" : "L",
    }))
    .sort((a, b) => a.t - b.t);
  if (series.length < 4 && extrema.length) {
    const mixed = [...series, ...extrema.map((e) => ({ t: e.t, v: e.v }))].sort(
      (a, b) => a.t - b.t
    );
    return { series: mixed, extrema };
  }
  return { series, extrema };
}

async function fetchBoomFile() {
  const res = await fetch(`${BOOM_TIDES_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) {
    throw new Error("The Boom tide file has not landed yet.");
  }
  if (!res.ok) throw new Error(`Boom tide file failed (${res.status})`);
  const json = await res.json();
  const parsed = json.series?.length ? json : parseSurfline(json);
  if (!parsed.series?.length) {
    throw new Error("The Boom tide file has not landed yet.");
  }
  return parsed;
}

const NOAA_PRED = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const NOAA_META = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations";

function predictionWindow(now = Date.now()) {
  const start = startOfZonedDay(new Date(now - 36 * 60 * 60 * 1000)).getTime();
  const end = startOfZonedDay(new Date(now + 8 * 24 * 60 * 60 * 1000)).getTime();
  return { start, end };
}

function ymd(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function browserStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Tide request failed (${res.status})`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseNoaaTime(stamp) {
  return Date.parse(String(stamp).replace(" ", "T") + "Z");
}

function pack(beach, series, extrema, source, live) {
  return {
    station: beach.id,
    fetchedAt: Date.now(),
    series,
    extrema,
    source,
    lastT: series[series.length - 1]?.t ?? 0,
    stale: false,
    live,
  };
}

function coversNow(series) {
  if (!series?.length) return false;
  const now = Date.now();
  return series[0].t <= now && series[series.length - 1].t >= now + 6 * 60 * 60 * 1000;
}

function readSeries(id) {
  try {
    const raw = browserStorage()?.getItem(`live-tide-series:${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const series = (parsed.series || []).map(([t, v]) => ({ t, v }));
    const extrema = (parsed.extrema || []).map(([t, v, type]) => ({ t, v, type }));
    if (!coversNow(series)) return null;
    return { series, extrema };
  } catch {
    return null;
  }
}

function writeSeries(id, series, extrema) {
  try {
    browserStorage()?.setItem(
      `live-tide-series:${id}`,
      JSON.stringify({
        series: series.map((point) => [point.t, point.v]),
        extrema: extrema.map((point) => [point.t, point.v, point.type]),
      })
    );
  } catch {
    /* a full disk should not blank the tide */
  }
}

function seriesFromExtrema(extrema) {
  const ordered = [...extrema].sort((a, b) => a.t - b.t);
  const series = [];
  const step = 10 * 60 * 1000;
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i];
    const b = ordered[i + 1];
    for (let t = a.t; t < b.t; t += step) {
      const u = (t - a.t) / (b.t - a.t || 1);
      const weight = (1 - Math.cos(Math.PI * u)) / 2;
      series.push({ t, v: a.v * (1 - weight) + b.v * weight });
    }
  }
  const last = ordered[ordered.length - 1];
  if (last) series.push({ t: last.t, v: last.v });
  return series;
}

async function fetchNoaaPredictions(stationId) {
  const begin = ymd(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const end = ymd(Date.now() + 8 * 24 * 60 * 60 * 1000);
  const common =
    `product=predictions&application=live-tide&begin_date=${begin}&end_date=${end}` +
    `&datum=MLLW&station=${encodeURIComponent(stationId)}&time_zone=gmt&units=english&format=json`;
  const [curve, turns] = await Promise.all([
    fetchJson(`${NOAA_PRED}?${common}&interval=6`),
    fetchJson(`${NOAA_PRED}?${common}&interval=hilo`),
  ]);
  const extrema =
    !turns.error && turns.predictions?.length
      ? turns.predictions
          .map((row) => ({
            t: parseNoaaTime(row.t),
            v: Number(row.v),
            type: String(row.type).toUpperCase().startsWith("H") ? "H" : "L",
          }))
          .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
      : [];
  let series = [];
  if (!curve.error && curve.predictions?.length) {
    series = curve.predictions
      .map((row) => ({ t: parseNoaaTime(row.t), v: Number(row.v) }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v));
  }
  if (series.length < 4 && extrema.length >= 2) series = seriesFromExtrema(extrema);
  if (series.length < 4) {
    throw new Error(curve.error?.message || turns.error?.message || "NOAA returned no tide curve");
  }
  return { series, extrema };
}

function readModel(id) {
  try {
    const raw = browserStorage()?.getItem(`live-tide-model:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeModel(id, model) {
  try {
    browserStorage()?.setItem(`live-tide-model:${id}`, JSON.stringify(model));
  } catch {
    /* ignore */
  }
}

async function modelFromStation(stationId, depth = 0) {
  const saved = readModel(stationId);
  if (saved?.constituents?.length) return { model: saved, subordinate: null };
  if (NOAA_MODELS[stationId]) return { model: NOAA_MODELS[stationId], subordinate: null };
  const harcon = await fetchJson(`${NOAA_META}/${encodeURIComponent(stationId)}/harcon.json`);
  const rows = harcon.HarmonicConstituents || [];
  if (rows.length) {
    let z0 = 0;
    try {
      const datums = await fetchJson(`${NOAA_META}/${encodeURIComponent(stationId)}/datums.json`);
      const msl = datums.datums?.find((row) => row.name === "MSL")?.value;
      const mllw = datums.datums?.find((row) => row.name === "MLLW")?.value;
      if (msl != null && mllw != null) z0 = Number(msl) - Number(mllw);
    } catch {
      z0 = 0;
    }
    const model = {
      z0,
      constituents: rows.map((row) => ({
        name: row.name,
        amp: Number(row.amplitude),
        phase: Number(row.phase_GMT),
      })),
    };
    writeModel(stationId, model);
    return { model, subordinate: null };
  }
  if (depth > 0) return null;
  const offsets = await fetchJson(`${NOAA_META}/${encodeURIComponent(stationId)}/tidepredoffsets.json`);
  if (!offsets.refStationId) return null;
  const ref = NOAA_MODELS[offsets.refStationId] || (await modelFromStation(offsets.refStationId, depth + 1))?.model;
  if (!ref) return null;
  const high = Number(offsets.heightOffsetHighTide);
  const low = Number(offsets.heightOffsetLowTide);
  return {
    model: ref,
    subordinate: {
      mode: offsets.heightAdjustedType === "F" ? "F" : "R",
      high: Number.isFinite(high) ? high : 1,
      low: Number.isFinite(low) ? low : 1,
      highMin: Number(offsets.timeOffsetHighTide) || 0,
      lowMin: Number(offsets.timeOffsetLowTide) || 0,
    },
  };
}

async function harmonicFallback(beach, start, end) {
  const id = beach.noaaId;
  const embedded = id && SUBORDINATES[id];
  if (embedded && NOAA_MODELS[embedded.ref]) {
    return predictSubordinate(NOAA_MODELS[embedded.ref], embedded, start, end);
  }
  if (id && NOAA_MODELS[id]) return predictModel(NOAA_MODELS[id], start, end);
  if (beach.model) return predictModel(beach.model, start, end);
  if (!id) return null;
  try {
    const resolved = await modelFromStation(id);
    if (!resolved?.model) return null;
    if (resolved.subordinate) return predictSubordinate(resolved.model, resolved.subordinate, start, end);
    return predictModel(resolved.model, start, end);
  } catch (error) {
    console.warn(error);
    return null;
  }
}

async function fetchBoom() {
  const generated = fromHarmonics(Date.now());
  try {
    const file = await fetchBoomFile();
    const covered = rollingTide(Date.now(), file);
    const lastT = covered.series[covered.series.length - 1]?.t ?? 0;
    return {
      station: STATION.id,
      fetchedAt: file.fetchedAt ?? Date.now(),
      series: covered.series,
      extrema: covered.extrema ?? [],
      source: covered.source ?? file.source ?? "harmonics",
      lastT,
      stale: false,
      live: true,
    };
  } catch (error) {
    console.warn(error);
    const lastT = generated.series[generated.series.length - 1]?.t ?? 0;
    return {
      station: STATION.id,
      fetchedAt: Date.now(),
      series: generated.series,
      extrema: generated.extrema,
      source: "harmonics",
      lastT,
      stale: false,
      live: false,
    };
  }
}

async function fetchNoaa(beach) {
  const { start, end } = predictionWindow();
  try {
    const official = await fetchNoaaPredictions(beach.noaaId);
    writeSeries(beach.id, official.series, official.extrema);
    return pack(beach, official.series, official.extrema, "noaa", true);
  } catch (error) {
    console.warn(error);
    const cached = readSeries(beach.id);
    if (cached) return pack(beach, cached.series, cached.extrema, "cache", false);
    const backup = await harmonicFallback(beach, start, end);
    if (backup?.series?.length) return pack(beach, backup.series, backup.extrema, "harmonics", false);
    throw error;
  }
}

function fetchHarmonic(beach) {
  const { start, end } = predictionWindow();
  const predicted = predictModel(beach.model, start, end);
  return pack(beach, predicted.series, predicted.extrema, "harmonics", true);
}

export async function fetchTide(beach = STATION) {
  if (!beach || beach.source === "boom" || beach.id === "boom") return fetchBoom();
  if (beach.source === "harmonics" && beach.model) return fetchHarmonic(beach);
  if (beach.noaaId) return fetchNoaa(beach);
  throw new Error("This beach has no tide.");
}

function pointAt(series, i) {
  if (i < 0) return series[0];
  if (i >= series.length) return series[series.length - 1];
  return series[i];
}

/** Catmull-Rom height on u in [0,1] between p1 and p2. */
export function crSegment(p0, p1, p2, p3, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const height =
    0.5 *
    (2 * p1.v +
      (-p0.v + p2.v) * u +
      (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * u2 +
      (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * u3);
  const dudu =
    0.5 *
    (-p0.v +
      p2.v +
      2 * (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * u +
      3 * (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * u2);
  return { height, dudu };
}

export function sampleTide(series, timeMs) {
  if (!series?.length) return null;
  if (timeMs <= series[0].t) {
    return { height: series[0].v, slope: 0 };
  }
  const last = series[series.length - 1];
  if (timeMs >= last.t) {
    return { height: last.v, slope: 0 };
  }
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= timeMs) lo = mid;
    else hi = mid;
  }
  const p0 = pointAt(series, lo - 1);
  const p1 = series[lo];
  const p2 = series[hi];
  const p3 = pointAt(series, hi + 1);
  const span = p2.t - p1.t || 1;
  const u = (timeMs - p1.t) / span;
  const { height, dudu } = crSegment(p0, p1, p2, p3, u);
  const slope = (dudu / span) * 3600000;
  return { height, slope };
}
