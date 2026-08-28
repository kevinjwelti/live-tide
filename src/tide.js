import { gmtStamp, parseNoaaGmt } from "./time.js";

export const STATIONS = [
  {
    id: "9410170",
    name: "SAN DIEGO, CALIFORNIA",
    hint: "Tap to switch · Scripps Pier, La Jolla",
  },
  {
    id: "9410230",
    name: "LA JOLLA, CALIFORNIA",
    hint: "Tap to switch · San Diego Bay",
  },
];

export const DEFAULT_STATION = STATIONS[0].id;
const APP = "sandiego-tide-art";
const CACHE_KEY = "live-tide-cache-v1";
export const REFRESH_MS = 30 * 60 * 1000;

function stationById(id) {
  return STATIONS.find((s) => s.id === id) ?? STATIONS[0];
}

export function loadSavedStation() {
  try {
    const id = localStorage.getItem("live-tide-station");
    return stationById(id);
  } catch {
    return stationById(DEFAULT_STATION);
  }
}

export function saveStation(id) {
  try {
    localStorage.setItem("live-tide-station", id);
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

export async function fetchTide(station, now = new Date()) {
  const cached = readCache(station);
  if (cached && now.getTime() - cached.fetchedAt < REFRESH_MS) {
    return { ...cached, fromCache: true, stale: false };
  }

  const begin = gmtStamp(new Date(now.getTime() - 36 * 3600000));
  const end = gmtStamp(new Date(now.getTime() + 36 * 3600000));
  const curveUrl = endpoint({ station, begin, end, interval: "6" });
  const hiloUrl = endpoint({ station, begin, end, interval: "hilo" });

  try {
    const [curveRes, hiloRes] = await Promise.all([
      fetch(curveUrl, { mode: "cors" }),
      fetch(hiloUrl, { mode: "cors" }),
    ]);
    if (!curveRes.ok || !hiloRes.ok) throw new Error("NOAA request failed");
    const [curveJson, hiloJson] = await Promise.all([curveRes.json(), hiloRes.json()]);
    if (!curveJson.predictions || curveJson.error) {
      throw new Error(curveJson.error?.message || "NOAA returned no predictions");
    }
    const payload = {
      station,
      fetchedAt: Date.now(),
      series: parsePredictions(curveJson),
      extrema: parsePredictions(hiloJson, true),
    };
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
