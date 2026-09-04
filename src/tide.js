import { gmtStamp, parseNoaaGmt } from "./time.js";

export const STATIONS = [
  {
    id: "boom-corinto",
    name: "THE BOOM, NICARAGUA",
    hint: "Tap to switch · La Jolla, Scripps",
    source: "surfline",
    spotId: "61d4d151c15a827dc58364ec",
    credit: "Tide predictions in feet · Surfline · Corinto, Isla Cardon",
    tz: "America/Managua",
    lat: 12.635,
    lon: -87.361,
  },
  {
    id: "9410230",
    name: "LA JOLLA, CALIFORNIA",
    hint: "Tap to switch · The Boom, Nicaragua",
    source: "noaa",
    credit: "Tide predictions in feet, MLLW · NOAA NOS CO-OPS",
    tz: "America/Los_Angeles",
    lat: 32.8669,
    lon: -117.2571,
  },
];

export const DEFAULT_STATION = STATIONS[0].id;
const APP = "sandiego-tide-art";
const CACHE_KEY = "live-tide-cache-v2";
const STATION_KEY = "live-tide-station-v3";
export const REFRESH_MS = 30 * 60 * 1000;

const SURFLINE_TIDES =
  "https://services.surfline.com/kbyg/spots/forecasts/tides";

function stationById(id) {
  return STATIONS.find((s) => s.id === id) ?? STATIONS[0];
}

export function loadSavedStation() {
  try {
    const id = localStorage.getItem(STATION_KEY);
    return stationById(id);
  } catch {
    return stationById(DEFAULT_STATION);
  }
}

export function saveStation(id) {
  try {
    localStorage.setItem(STATION_KEY, id);
  } catch {
    /* ignore quota */
  }
}

function endpoint({ station, begin, end, interval }) {
  const params = new URLSearchParams({
    product: "predictions",
    application: APP,
    begin_date: begin,
    end_date: end,
    datum: "MLLW",
    station,
    time_zone: "gmt",
    units: "english",
    interval,
    format: "json",
  });
  return `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`;
}

function readCache(station) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.station !== station || !parsed.series?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function parsePredictions(json, withType = false) {
  const rows = json?.predictions ?? [];
  return rows.map((row) => ({
    t: parseNoaaGmt(row.t),
    v: Number(row.v),
    type: withType ? row.type : undefined,
  }));
}

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

async function fetchSurfline(station, now) {
  const url = `${SURFLINE_TIDES}?${new URLSearchParams({
    spotId: station.spotId,
    days: "3",
    intervalHours: "1",
  })}`;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Surfline request failed");
  const json = await res.json();
  const parsed = parseSurfline(json);
  if (!parsed.series.length) throw new Error("Surfline returned no tide curve");
  return {
    station: station.id,
    fetchedAt: Date.now(),
    series: parsed.series,
    extrema: parsed.extrema,
    source: "surfline",
  };
}

async function fetchNoaa(station, now) {
  const begin = gmtStamp(new Date(now.getTime() - 36 * 3600000));
  const end = gmtStamp(new Date(now.getTime() + 36 * 3600000));
  const curveUrl = endpoint({ station: station.id, begin, end, interval: "6" });
  const hiloUrl = endpoint({ station: station.id, begin, end, interval: "hilo" });
  const [curveRes, hiloRes] = await Promise.all([
    fetch(curveUrl, { mode: "cors" }),
    fetch(hiloUrl, { mode: "cors" }),
  ]);
  if (!curveRes.ok || !hiloRes.ok) throw new Error("NOAA request failed");
  const [curveJson, hiloJson] = await Promise.all([curveRes.json(), hiloRes.json()]);
  if (!curveJson.predictions || curveJson.error) {
    throw new Error(curveJson.error?.message || "NOAA returned no predictions");
  }
  return {
    station: station.id,
    fetchedAt: Date.now(),
    series: parsePredictions(curveJson),
    extrema: parsePredictions(hiloJson, true),
    source: "noaa",
  };
}

export async function fetchTide(station, now = new Date()) {
  const cached = readCache(station.id);
  if (cached && now.getTime() - cached.fetchedAt < REFRESH_MS) {
    return { ...cached, fromCache: true, stale: false };
  }

  try {
    const payload =
      station.source === "surfline" ? await fetchSurfline(station, now) : await fetchNoaa(station, now);
    writeCache(payload);
    return { ...payload, fromCache: false, stale: false };
  } catch (error) {
    if (cached) return { ...cached, fromCache: true, stale: true, error };
    throw error;
  }
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
  const a = series[lo];
  const b = series[hi];
  const span = b.t - a.t || 1;
  const u = (timeMs - a.t) / span;
  const height = a.v + (b.v - a.v) * u;
  const slope = ((b.v - a.v) / span) * 3600000;
  return { height, slope };
}

export function nextStation(id) {
  const index = STATIONS.findIndex((s) => s.id === id);
  return STATIONS[(index + 1) % STATIONS.length];
}
