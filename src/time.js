/** America/Los_Angeles clock helpers and solar tint. */

export const TZ = "America/Los_Angeles";
export const SD_LAT = 32.7156;
export const SD_LON = -117.1767;

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

/** Solar elevation in degrees for San Diego (good enough for sky tint). */
export function solarElevation(date, lat = SD_LAT, lon = SD_LON) {
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
  const alt = Math.asin(
    Math.sin(lat * rad) * Math.sin(decl) + Math.cos(lat * rad) * Math.cos(decl) * Math.cos(ha)
  );
  return alt / rad;
}

function mix(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  return a.map((v, i) => v + (b[i] - v) * u);
}

function rgb(c) {
  return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
}

/**
 * Palette keyed off real solar elevation so morning gold, noon teal,
 * and night indigo follow the clock — not a fake mock hour.
 */
export function skyPalette(date) {
  const el = solarElevation(date);
  const night = {
    zenith: [8, 14, 28],
    horizon: [18, 28, 46],
    water: [10, 28, 42],
    foam: [170, 190, 210],
    sun: [210, 220, 240],
    type: "#e7eef6",
  };
  const twilight = {
    zenith: [28, 30, 58],
    horizon: [196, 110, 78],
    water: [28, 42, 62],
    foam: [232, 210, 186],
    sun: [255, 186, 110],
    type: "#f3ead8",
  };
  const golden = {
    zenith: [92, 128, 168],
    horizon: [236, 164, 92],
    water: [36, 86, 110],
    foam: [244, 228, 204],
    sun: [255, 198, 112],
    type: "#f3ead8",
  };
  const day = {
    zenith: [92, 156, 196],
    horizon: [176, 206, 220],
    water: [28, 96, 118],
    foam: [236, 246, 250],
    sun: [255, 236, 196],
    type: "#f6f1e4",
  };

  let a = night;
  let b = night;
  let t = 0;
  if (el < -12) {
    a = b = night;
  } else if (el < -4) {
    a = night;
    b = twilight;
    t = (el + 12) / 8;
  } else if (el < 8) {
    a = twilight;
    b = golden;
    t = (el + 4) / 12;
  } else if (el < 28) {
    a = golden;
    b = day;
    t = (el - 8) / 20;
  } else {
    a = b = day;
  }

  const zenith = mix(a.zenith, b.zenith, t);
  const horizon = mix(a.horizon, b.horizon, t);
  const water = mix(a.water, b.water, t);
  const foam = mix(a.foam, b.foam, t);
  const sun = mix(a.sun, b.sun, t);
  const type = t < 0.5 ? a.type : b.type;
  return {
    elevation: el,
    zenith: rgb(zenith),
    horizon: rgb(horizon),
    waterDeep: rgb(mix(water, [6, 16, 24], 0.55)),
    water: rgb(water),
    foam: rgb(foam),
    sun: rgb(sun),
    type,
    night: el < -4,
  };
}
