import { CURATED, beachFromStation, distanceKm } from "./beaches.js";

const CACHE_KEY = "live-tide-noaa-stations";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const LIST_URL =
  "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions";

const STATE_TZ = {
  ME: "America/New_York",
  NH: "America/New_York",
  MA: "America/New_York",
  RI: "America/New_York",
  CT: "America/New_York",
  NY: "America/New_York",
  NJ: "America/New_York",
  DE: "America/New_York",
  MD: "America/New_York",
  VA: "America/New_York",
  NC: "America/New_York",
  SC: "America/New_York",
  GA: "America/New_York",
  PA: "America/New_York",
  DC: "America/New_York",
  AL: "America/Chicago",
  MS: "America/Chicago",
  LA: "America/Chicago",
  TX: "America/Chicago",
  CA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  WA: "America/Los_Angeles",
  HI: "Pacific/Honolulu",
  PR: "America/Puerto_Rico",
  VI: "America/Puerto_Rico",
  GU: "Pacific/Guam",
  MP: "Pacific/Guam",
  AS: "Pacific/Pago_Pago",
};

export function timezoneForStation(station) {
  const state = station.state || "";
  const lon = Number(station.lng);
  if (state === "FL") return lon < -87.5 ? "America/Chicago" : "America/New_York";
  if (state === "AK") {
    if (lon < -169.5) return "America/Adak";
    if (lon > -140) return "America/Juneau";
    return "America/Anchorage";
  }
  if (STATE_TZ[state]) return STATE_TZ[state];
  const corr = Number(station.timezonecorr);
  if (Number.isFinite(corr)) {
    const inverted = -corr;
    return `Etc/GMT${inverted >= 0 ? "+" : ""}${inverted}`;
  }
  return "UTC";
}

export function slimStation(raw) {
  const lat = Number(raw.lat);
  const lng = Number(raw.lng ?? raw.lon);
  const station = {
    id: String(raw.id ?? raw.stationId ?? ""),
    name: String(raw.name || raw.id || ""),
    lat,
    lng,
    state: raw.state || "",
    timezonecorr: raw.timezonecorr,
  };
  station.tz = timezoneForStation(station);
  return station;
}

let memory = null;
let pending = null;

function browserStorage() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readCache() {
  try {
    const raw = browserStorage()?.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.stations?.length) return null;
    if (Date.now() - parsed.at > CACHE_MS) return null;
    return parsed.stations;
  } catch {
    return null;
  }
}

function writeCache(stations) {
  try {
    browserStorage()?.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), stations }));
  } catch {
    /* the menu still works for this visit */
  }
}

export function upgradeBeach(beach, stations = []) {
  if (!beach?.noaaId || !String(beach.id).startsWith("noaa-")) return beach;
  const station = stations.find((row) => row.id === beach.noaaId);
  if (!station) return beach;
  return beachFromStation(station);
}

export function cachedStations() {
  if (memory) return memory;
  memory = readCache();
  return memory;
}

export async function loadStations() {
  if (memory?.length) return memory;
  const cached = readCache();
  if (cached) {
    memory = cached;
    return memory;
  }
  if (pending) return pending;
  pending = fetch(LIST_URL, { cache: "force-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`Station list failed (${res.status})`);
      return res.json();
    })
    .then((json) => {
      const rows = json.stations || json.Stations || [];
      memory = rows.map(slimStation).filter((station) => station.id);
      writeCache(memory);
      return memory;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function searchBeaches(query, stations = []) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const curated = CURATED.filter((beach) =>
    [beach.menu, beach.name, beach.region, beach.id, beach.noaaId]
      .filter(Boolean)
      .some((part) => String(part).toLowerCase().includes(needle))
  );
  const noaa = [];
  for (const station of stations) {
    const hay = `${station.name} ${station.id} ${station.state}`.toLowerCase();
    if (!hay.includes(needle)) continue;
    const curatedHit = curated.find((beach) => beach.noaaId === station.id);
    if (curatedHit && curatedHit.menu.toLowerCase().includes(needle)) continue;
    noaa.push(beachFromStation(station));
    if (noaa.length >= 12) break;
  }
  return [...curated, ...noaa].slice(0, 14);
}

export function nearestBeach(lat, lon, stations = []) {
  let bestCurated = null;
  let bestCuratedKm = Infinity;
  for (const beach of CURATED) {
    const km = distanceKm(lat, lon, beach.lat, beach.lon);
    if (km < bestCuratedKm) {
      bestCuratedKm = km;
      bestCurated = beach;
    }
  }
  let bestStation = null;
  let bestStationKm = Infinity;
  for (const station of stations) {
    if (!Number.isFinite(station.lat) || !Number.isFinite(station.lng)) continue;
    const km = distanceKm(lat, lon, station.lat, station.lng);
    if (km < bestStationKm) {
      bestStationKm = km;
      bestStation = station;
    }
  }
  if (bestCurated && bestCuratedKm <= 80 && bestCuratedKm <= bestStationKm + 20) {
    return { beach: bestCurated, distanceKm: bestCuratedKm };
  }
  if (bestStation) return { beach: beachFromStation(bestStation), distanceKm: bestStationKm };
  if (bestCurated) return { beach: bestCurated, distanceKm: bestCuratedKm };
  return null;
}
