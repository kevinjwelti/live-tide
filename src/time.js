/** America/Los_Angeles clock helpers and solar tint. */

export const TZ = "America/Los_Angeles";
/** Scripps Pier / La Jolla — drive the sky from this station. */
export const LJ_LAT = 32.8669;
export const LJ_LON = -117.2571;
export const SD_LAT = LJ_LAT;
export const SD_LON = LJ_LON;

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});

const timeSecFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "long",
  day: "numeric",
  year: "numeric",
});

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatClock(date, withSeconds = false) {
  return (withSeconds ? timeSecFmt : timeFmt).format(date);
}

export function formatDate(date) {
  return dateFmt.format(date);
}

export function zonedParts(date) {
  const bag = {};
  for (const part of partsFmt.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** Local calendar day as YYYYMMDD for NOAA queries that use GMT dates. */
export function gmtStamp(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function startOfZonedDay(date) {
  const p = zonedParts(date);
  return zonedDate(p.year, p.month, p.day, 0, 0, 0);
}

export function startOfNextZonedDay(date) {
  const start = startOfZonedDay(date);
  const later = new Date(start.getTime() + 26 * 3600000);
  const n = zonedParts(later);
  return zonedDate(n.year, n.month, n.day, 0, 0, 0);
}

export function endOfZonedDay(date) {
  return new Date(startOfNextZonedDay(date).getTime() - 1);
}

/**
 * Construct a Date for a civil time in America/Los_Angeles.
 * Iterates from a UTC guess so DST is handled by the formatter.
 */
export function zonedDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  let guess = Date.UTC(year, month - 1, day, hour + 8, minute, second, ms);
  for (let i = 0; i < 4; i += 1) {
    const p = zonedParts(new Date(guess));
    const got = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const want = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += want - got;
  }
  return new Date(guess);
}

export function parseNoaaGmt(stamp) {
  const [day, time] = stamp.split(" ");
  return Date.parse(`${day}T${time}:00Z`);
}

/** Solar altitude and azimuth (degrees, azimuth clockwise from north). */
export function solarPosition(date, lat = LJ_LAT, lon = LJ_LON) {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + 36000.76983 * T) % 360;
  const M = (357.52911 + 35999.05029 * T) % 360;
  const C =
    (1.914602 - 0.004817 * T) * Math.sin(M * rad) + 0.019993 * Math.sin(2 * M * rad);
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lam = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps = (23.439291 - 0.0130042 * T) * rad;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lam * rad));
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545)) % 360;
  const lst = ((gmst + lon) % 360) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam * rad), Math.cos(lam * rad));
  const ha = lst - ra;
  const latR = lat * rad;
  const alt = Math.asin(
    Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha)
  );
  const az = Math.atan2(
    -Math.sin(ha),
    Math.tan(decl) * Math.cos(latR) - Math.sin(latR) * Math.cos(ha)
  );
  return {
    elevation: alt / rad,
    azimuth: ((az / rad) + 360) % 360,
  };
}

export function solarElevation(date, lat = LJ_LAT, lon = LJ_LON) {
  return solarPosition(date, lat, lon).elevation;
}

function mix(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  return a.map((v, i) => v + (b[i] - v) * u);
}

function rgb(c, a) {
  if (a == null) return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
  return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const NIGHT = { type: "#e7eef6" };
const GOLDEN = { type: "#f3ead8" };
const DAY = { type: "#eef4f8" };

/**
 * One multiply gel over the noon plate, from real Scripps sun position.
 * Midday (sun well up): identity — the photo as shot.
 * Late day: slightly warmer and dimmer.
 * Night: clearly dark.
 */
export function skyPalette(date) {
  const { elevation: el, azimuth: az } = solarPosition(date);
  const night = 1 - smoothstep(-14, -2, el);
  const day = smoothstep(10, 32, el);
  const lowSun = (1 - day) * (1 - night);
  const evening = smoothstep(150, 220, az);
  const warm = lowSun * evening;
  const cool = day;

  const morning = lowSun * (1 - evening);
  const dayGel = mix([255, 255, 255], [255, 176, 110], evening);
  const gel = mix(mix(dayGel, [206, 226, 255], morning * 0.32), [16, 26, 48], night);
  const overlayAlpha = (0.1 + 0.06 * morning + 0.2 * evening) * lowSun + 0.82 * night;
  // Modest always-on dim so white type holds on the noon plate.
  // Night gel already darkens the photo, so this eases off after sunset.
  const scrim = 0.3 * (1 - night);

  return {
    elevation: el,
    azimuth: az,
    overlayColor: rgb(gel),
    overlayAlpha,
    night,
    warm,
    cool,
    scrim,
    type: night > 0.5 ? NIGHT.type : warm > 0.45 ? GOLDEN.type : DAY.type,
    vignette: 0.55 + 0.25 * night,
    gradeKey: `${(el * 4).toFixed(0)}:${(warm * 20).toFixed(0)}:${(cool * 20).toFixed(0)}:${(night * 20).toFixed(0)}`,
  };
}

/** After Scripps sunset, once the sun is well down — use the moonlit plate. */
export function isNightScene(palette) {
  return palette.night >= 0.5;
}
