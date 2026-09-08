export const STATION = {
  id: "boom-corinto",
  name: "THE BOOM, NICARAGUA",
  source: "surfline-file",
  spotId: "61d4d151c15a827dc58364ec",
  credit: "Tide predictions in feet · Surfline · Corinto, Isla Cardon",
  tz: "America/Managua",
  lat: 12.635,
  lon: -87.361,
};

export const REFRESH_MS = 30 * 60 * 1000;

const BOOM_TIDES_URL = `${import.meta.env.BASE_URL}data/boom-tides.json`;

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
  const lastT = parsed.series[parsed.series.length - 1]?.t ?? 0;
  return {
    station: STATION.id,
    fetchedAt: json.fetchedAt ?? Date.now(),
    series: parsed.series,
    extrema: parsed.extrema ?? [],
    source: json.source ?? "surfline",
    lastT,
    stale: lastT > 0 && lastT < Date.now() - 90 * 60000,
  };
}

export async function fetchTide() {
  return fetchBoomFile();
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
