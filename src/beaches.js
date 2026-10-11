import { WORLD_MODELS } from "./tide-models.js";

const CURRENT = "live-tide-beach";
const RECENTS = "live-tide-recents";
const FAVORITES = "live-tide-favorites";
const KNOWN = "live-tide-known";

function noaa(partial) {
  return {
    source: "noaa",
    credit: `Tide predictions in feet · NOAA · ${partial.station}`,
    ...partial,
  };
}

function harmonic(partial) {
  return {
    source: "harmonics",
    model: WORLD_MODELS[partial.id],
    ...partial,
  };
}

export const CURATED = [
  {
    id: "boom",
    menu: "The Boom",
    name: "THE BOOM, NICARAGUA",
    region: "Nicaragua",
    tz: "America/Managua",
    lat: 12.635,
    lon: -87.361,
    source: "boom",
    credit: "Tide predictions in feet · Surfline · Corinto, Isla Cardon",
  },
  noaa({
    id: "pipeline",
    menu: "Pipeline",
    name: "PIPELINE, OAHU",
    region: "Hawaii",
    tz: "Pacific/Honolulu",
    lat: 21.665,
    lon: -158.053,
    noaaId: "1612668",
    station: "Haleiwa, Waialua Bay",
  }),
  noaa({
    id: "malibu",
    menu: "Malibu",
    name: "MALIBU, CALIFORNIA",
    region: "California",
    tz: "America/Los_Angeles",
    lat: 34.036,
    lon: -118.678,
    noaaId: "9410840",
    station: "Santa Monica Pier",
  }),
  // Santa Monica Pier is nearer to Manhattan Beach than Los Angeles Outer Harbor.
  noaa({
    id: "manhattan",
    menu: "Manhattan Beach",
    name: "MANHATTAN BEACH, CALIFORNIA",
    region: "California",
    tz: "America/Los_Angeles",
    lat: 33.8847,
    lon: -118.4109,
    noaaId: "9410840",
    station: "Santa Monica Pier",
  }),
  noaa({
    id: "huntington",
    menu: "Huntington Beach",
    name: "HUNTINGTON BEACH, CALIFORNIA",
    region: "California",
    tz: "America/Los_Angeles",
    lat: 33.654,
    lon: -118.004,
    noaaId: "9410583",
    station: "Balboa Pier",
  }),
  noaa({
    id: "trestles",
    menu: "Trestles",
    name: "TRESTLES, CALIFORNIA",
    region: "California",
    tz: "America/Los_Angeles",
    lat: 33.384,
    lon: -117.594,
    noaaId: "TWC0419",
    station: "San Clemente",
  }),
  noaa({
    id: "ocean-beach",
    menu: "Ocean Beach",
    name: "OCEAN BEACH, SAN FRANCISCO",
    region: "California",
    tz: "America/Los_Angeles",
    lat: 37.759,
    lon: -122.51,
    noaaId: "9414275",
    station: "Ocean Beach",
  }),
  noaa({
    id: "santa-cruz",
    menu: "Santa Cruz",
    name: "SANTA CRUZ, CALIFORNIA",
    region: "California",
    tz: "America/Los_Angeles",
    lat: 36.951,
    lon: -122.026,
    noaaId: "9413745",
    station: "Santa Cruz",
  }),
  noaa({
    id: "rincon",
    menu: "Rincon",
    name: "RINCON, CALIFORNIA",
    region: "California",
    tz: "America/Los_Angeles",
    lat: 34.348,
    lon: -119.478,
    noaaId: "9411270",
    station: "Rincon Island",
  }),
  noaa({
    id: "outer-banks",
    menu: "Outer Banks",
    name: "OUTER BANKS, NORTH CAROLINA",
    region: "North Carolina",
    tz: "America/New_York",
    lat: 35.91,
    lon: -75.596,
    noaaId: "8652226",
    station: "Jennettes Pier",
  }),
  noaa({
    id: "montauk",
    menu: "Montauk",
    name: "MONTAUK, NEW YORK",
    region: "New York",
    tz: "America/New_York",
    lat: 41.048,
    lon: -71.936,
    noaaId: "8510560",
    station: "Montauk, Fort Pond Bay",
  }),
  harmonic({
    id: "ericeira",
    menu: "Ericeira",
    name: "ERICEIRA, PORTUGAL",
    region: "Portugal",
    tz: "Europe/Lisbon",
    lat: 38.963,
    lon: -9.422,
    credit: "Tide predictions in feet · Cascais reference · Ericeira",
  }),
  harmonic({
    id: "hossegor",
    menu: "Hossegor",
    name: "HOSSEGOR, FRANCE",
    region: "France",
    tz: "Europe/Paris",
    lat: 43.666,
    lon: -1.441,
    credit: "Tide predictions in feet · SHOM · Capbreton",
  }),
  harmonic({
    id: "uluwatu",
    menu: "Uluwatu",
    name: "ULUWATU, BALI",
    region: "Indonesia",
    tz: "Asia/Makassar",
    lat: -8.829,
    lon: 115.085,
    credit: "Tide predictions in feet · Benoa reference · Uluwatu",
  }),
  harmonic({
    id: "jeffreys",
    menu: "Jeffreys Bay",
    name: "JEFFREYS BAY, SOUTH AFRICA",
    region: "South Africa",
    tz: "Africa/Johannesburg",
    lat: -34.021,
    lon: 24.931,
    credit: "Tide predictions in feet · Port Elizabeth reference · Jeffreys Bay",
  }),
  harmonic({
    id: "snapper",
    menu: "Snapper Rocks",
    name: "SNAPPER ROCKS, AUSTRALIA",
    region: "Australia",
    tz: "Australia/Brisbane",
    lat: -28.164,
    lon: 153.551,
    credit: "Tide predictions in feet · Brisbane reference · Snapper Rocks",
  }),
  harmonic({
    id: "puerto",
    menu: "Puerto Escondido",
    name: "PUERTO ESCONDIDO, MEXICO",
    region: "Mexico",
    tz: "America/Mexico_City",
    lat: 15.872,
    lon: -97.077,
    credit: "Tide predictions in feet · Puerto Angel reference · Puerto Escondido",
  }),
];

export const BOOM = CURATED[0];

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", CA: "California", CT: "Connecticut",
  DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MS: "Mississippi", NH: "New Hampshire",
  NJ: "New Jersey", NY: "New York", NC: "North Carolina", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", TX: "Texas", VA: "Virginia", WA: "Washington",
  PR: "Puerto Rico", VI: "U.S. Virgin Islands", GU: "Guam", AS: "American Samoa", MP: "Northern Mariana Islands",
};

export function memoryStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

export function defaultStore() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* private mode */
  }
  return memoryStore();
}

function readJson(store, key, fallback) {
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function snapshot(beach) {
  const { model, ...rest } = beach;
  return rest;
}

export function prettyPlace(text) {
  const clean = String(text || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || clean !== clean.toUpperCase()) return clean;
  return clean.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function beachFromStation(station) {
  const place = prettyPlace(station.name);
  const state = STATE_NAMES[station.state] || station.state || "";
  const titled = state ? `${place}, ${state}` : place;
  return {
    id: `noaa-${station.id}`,
    menu: place,
    name: titled.toUpperCase(),
    region: state,
    tz: station.tz || "UTC",
    lat: Number(station.lat),
    lon: Number(station.lng),
    source: "noaa",
    noaaId: String(station.id),
    credit: `Tide predictions in feet · NOAA · ${place}`,
  };
}

export function resolveBeachId(id, store = defaultStore()) {
  if (!id) return null;
  const curated = CURATED.find((beach) => beach.id === id);
  if (curated) return curated;
  const known = readJson(store, KNOWN, {});
  if (known[id]) return known[id];
  if (String(id).startsWith("noaa-")) {
    return beachFromStation({
      id: String(id).slice(5),
      name: String(id).slice(5),
      lat: 0,
      lng: 0,
      state: "",
      tz: "UTC",
    });
  }
  return null;
}

export function resolveInitialBeach(search = "", store = defaultStore()) {
  const param = new URLSearchParams(search).get("beach");
  if (param) {
    const chosen = resolveBeachId(param, store);
    if (chosen) return chosen;
  }
  const saved = store.getItem(CURRENT);
  if (saved) {
    const chosen = resolveBeachId(saved, store);
    if (chosen) return chosen;
  }
  return BOOM;
}

export function rememberBeach(beach, store = defaultStore()) {
  store.setItem(CURRENT, beach.id);
  const known = readJson(store, KNOWN, {});
  known[beach.id] = snapshot(beach);
  store.setItem(KNOWN, JSON.stringify(known));
  const recents = readJson(store, RECENTS, []).filter((id) => id !== beach.id);
  recents.unshift(beach.id);
  store.setItem(RECENTS, JSON.stringify(recents.slice(0, 6)));
}

export function isFavorite(id, store = defaultStore()) {
  return readJson(store, FAVORITES, []).includes(id);
}

export function toggleFavorite(beach, store = defaultStore()) {
  const ids = readJson(store, FAVORITES, []);
  const on = ids.includes(beach.id);
  const next = on ? ids.filter((id) => id !== beach.id) : [beach.id, ...ids].slice(0, 12);
  store.setItem(FAVORITES, JSON.stringify(next));
  const known = readJson(store, KNOWN, {});
  known[beach.id] = snapshot(beach);
  store.setItem(KNOWN, JSON.stringify(known));
  return !on;
}

export function favoriteBeaches(store = defaultStore()) {
  return readJson(store, FAVORITES, [])
    .map((id) => resolveBeachId(id, store))
    .filter(Boolean);
}

export function recentBeaches(store = defaultStore()) {
  return readJson(store, RECENTS, [])
    .map((id) => resolveBeachId(id, store))
    .filter(Boolean);
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function writeBeachParam(id) {
  const params = new URLSearchParams(location.search);
  params.set("beach", id);
  const next = `${location.pathname}?${params.toString()}${location.hash}`;
  history.replaceState(null, "", next);
}
