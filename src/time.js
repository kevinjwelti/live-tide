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

const NIGHT = {
  zenith: [8, 14, 30],
  horizon: [16, 26, 48],
  water: [8, 22, 38],
  foam: [168, 188, 210],
  sun: [210, 220, 240],
  type: "#e7eef6",
};
const TWILIGHT = {
  zenith: [36, 34, 68],
  horizon: [186, 108, 82],
  water: [28, 44, 64],
  foam: [232, 210, 186],
  sun: [255, 176, 96],
  type: "#f3ead8",
};
const GOLDEN = {
  zenith: [98, 132, 168],
  horizon: [236, 164, 92],
  water: [36, 86, 110],
  foam: [244, 228, 204],
  sun: [255, 198, 112],
  type: "#f3ead8",
};
const MORNING = {
  zenith: [118, 186, 232],
  horizon: [198, 224, 242],
  water: [36, 118, 148],
  foam: [236, 246, 252],
  sun: [255, 250, 236],
  type: "#eef4f8",
};
const DAY = {
  zenith: [96, 176, 232],
  horizon: [186, 220, 242],
  water: [28, 114, 142],
  foam: [240, 248, 252],
  sun: [255, 252, 244],
  type: "#eef4f8",
};

function mixFive(weights, palettes) {
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const keys = ["zenith", "horizon", "water", "foam", "sun"];
  const out = {};
  for (const key of keys) {
    out[key] = [0, 0, 0];
    palettes.forEach((p, i) => {
      const w = weights[i] / sum;
      out[key][0] += p[key][0] * w;
      out[key][1] += p[key][1] * w;
      out[key][2] += p[key][2] * w;
    });
  }
  const top = palettes[weights.indexOf(Math.max(...weights))];
  out.type = top.type;
  return out;
}

/**
 * Continuous lighting from Scripps solar altitude.
 * Golden warmth only near the real horizon; morning/day is cool and bright.
 */
export function skyPalette(date) {
  const { elevation: el, azimuth: az } = solarPosition(date);
  const evening = smoothstep(155, 210, az);
  const nightW = 1 - smoothstep(-16, -6, el);
  const twilightW = smoothstep(-14, -6, el) * (1 - smoothstep(-3, 2, el));
  const goldenHi = 8 + 8 * evening;
  const goldenW = smoothstep(-5, 1, el) * (1 - smoothstep(goldenHi - 6, goldenHi, el));
  const morningW = (1 - evening) * smoothstep(4, 10, el) * (1 - smoothstep(16, 26, el));
  const dayW = smoothstep(12 + 4 * evening, 22 + 4 * evening, el);
  const mixed = mixFive(
    [nightW, twilightW, goldenW, morningW, dayW],
    [NIGHT, TWILIGHT, GOLDEN, MORNING, DAY]
  );
  const warm = Math.min(1, goldenW + twilightW * 0.7);
  const cool = Math.min(1, Math.max(0, morningW + dayW - warm * 0.35));
  const facing = 258;
  const sunAhead = Math.cos(((az - facing) * Math.PI) / 180);
  const sunInFrame =
    Math.max(0, sunAhead) * smoothstep(-6, 1, el) * (1 - smoothstep(20, 36, el) * 0.4);

  return {
    elevation: el,
    azimuth: az,
    zenith: rgb(mixed.zenith),
    horizon: rgb(mixed.horizon),
    waterDeep: rgb(mix(mixed.water, [6, 16, 24], 0.55)),
    water: rgb(mixed.water),
    foam: rgb(mixed.foam),
    sun: rgb(mixed.sun),
    type: nightW > 0.5 ? "#e7eef6" : warm > 0.45 ? "#f3ead8" : "#eef4f8",
    night: nightW,
    warm,
    cool,
    sunInFrame,
    gradeKey: `${(el * 4).toFixed(0)}:${(warm * 20).toFixed(0)}:${(cool * 20).toFixed(0)}:${(nightW * 20).toFixed(0)}`,
    photo: {
      hue: -14 * cool - 6 * nightW,
      sat: 1 + 0.52 * cool - 0.55 * nightW,
      bright: (1 - nightW) * (1.04 + 0.22 * cool) + 0.36 * nightW,
      contrast: 1.08 + 0.32 * cool - 0.12 * nightW,
    },
    overlay: rgb(mix(mixed.zenith, mixed.horizon, 0.35)),
    overlayAlpha: 0.58 * cool,
    overlayMode: "color",
    skyWash: 0.22 * cool,
    screenLift: 0,
    satBlend: 0.48 * cool,
    vivid: 0.42 * cool,
    waterWash: 0.36 * cool,
    skyCover: 0.78 * cool,
    sunHide: 0.94 * cool * (1 - warm),
    vignette: Math.min(1, 0.08 + 0.92 * (1 - cool) + 0.1 * nightW),
    nightFill: rgb(NIGHT.zenith, 0.72 * nightW),
  };
}
