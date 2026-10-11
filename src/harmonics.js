/**
 * Tide from harmonic constituents.
 * Equilibrium arguments follow Meeus; nodal factors follow Schureman.
 * Height is z0 + Σ f·A·cos(V + u − g), the same convention NOAA publishes.
 */

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function mod(deg) {
  return ((deg % 360) + 360) % 360;
}

function poly(coefficients, t) {
  let sum = 0;
  for (let i = 0; i < coefficients.length; i += 1) sum += coefficients[i] * t ** i;
  return sum;
}

function s2d(degrees, arcmins = 0, arcsecs = 0) {
  return degrees + arcmins / 60 + arcsecs / 3600;
}

function julianDay(date) {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  const day =
    date.getUTCDate() +
    date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 +
    date.getUTCSeconds() / 86400 +
    date.getUTCMilliseconds() / 86400000;
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const century = Math.floor(year / 100);
  const gregorian = 2 - century + Math.floor(century / 4);
  return (
    Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day +
    gregorian -
    1524.5
  );
}

const OBLIQUITY = [
  s2d(23, 26, 21.448),
  -s2d(0, 0, 4680.93),
  -s2d(0, 0, 1.55),
  s2d(0, 0, 1999.25),
  -s2d(0, 0, 51.38),
  -s2d(0, 0, 249.67),
  -s2d(0, 0, 39.05),
  s2d(0, 0, 7.12),
  s2d(0, 0, 27.87),
  s2d(0, 0, 5.79),
  s2d(0, 0, 2.45),
].map((coef, index) => coef * 0.01 ** index);

const SOLAR_LONG = [280.46645, 36000.76983, 0.0003032];
const SOLAR_PERIGEE = [280.46645 - 357.5291, 36000.76932 - 35999.0503, 0.0003032 + 0.0001559, 0.00000048];
const LUNAR_LONG = [218.3164591, 481267.88134236, -0.0013268, 1 / 538841 - 1 / 65194000];
const LUNAR_NODE = [125.044555, -1934.1361849, 0.0020762, 1 / 467410, -1 / 60616000];
const LUNAR_PERIGEE = [83.353243, 4069.0137111, -0.0103238, -1 / 80053, 1 / 18999000];
const INCLINATION = [5.145];

function obliquityAngles(node, inclination, obliquity) {
  const n = node * D2R;
  const i = inclination * D2R;
  const w = obliquity * D2R;
  const cosI = Math.cos(i) * Math.cos(w) - Math.sin(i) * Math.sin(w) * Math.cos(n);
  const capitalI = Math.acos(Math.min(1, Math.max(-1, cosI)));
  const e1 = Math.atan((Math.cos(0.5 * (w - i)) / Math.cos(0.5 * (w + i))) * Math.tan(0.5 * n));
  const e2 = Math.atan((Math.sin(0.5 * (w - i)) / Math.sin(0.5 * (w + i))) * Math.tan(0.5 * n));
  const a = e1 - 0.5 * n;
  const b = e2 - 0.5 * n;
  const xi = -(a + b) * R2D;
  const nu = (a - b) * R2D;
  const nuRad = nu * D2R;
  const twoI = 2 * capitalI;
  const nup =
    Math.atan((Math.sin(twoI) * Math.sin(nuRad)) / (Math.sin(twoI) * Math.cos(nuRad) + 0.3347)) * R2D;
  const sinI2 = Math.sin(capitalI) ** 2;
  const nupp =
    0.5 *
    Math.atan((sinI2 * Math.sin(2 * nuRad)) / (sinI2 * Math.cos(2 * nuRad) + 0.0727)) *
    R2D;
  return { I: capitalI * R2D, xi, nu, nup, nupp };
}

export function astronomy(date) {
  const century = (julianDay(date) - 2451545) / 36525;
  const s = mod(poly(LUNAR_LONG, century));
  const h = mod(poly(SOLAR_LONG, century));
  const p = mod(poly(LUNAR_PERIGEE, century));
  const node = mod(poly(LUNAR_NODE, century));
  const pp = mod(poly(SOLAR_PERIGEE, century));
  const omega = mod(poly(OBLIQUITY, century));
  const i = mod(poly(INCLINATION, century));
  const angles = obliquityAngles(node, i, omega);
  const hour = (julianDay(date) - Math.floor(julianDay(date))) * 360;
  return {
    s,
    h,
    p,
    N: node,
    pp,
    90: 90,
    omega,
    i,
    ...angles,
    "T+h-s": hour + h - s,
    P: mod(p - angles.xi),
  };
}

const ARG_KEYS = ["T+h-s", "s", "h", "p", "N", "pp", "90"];

const XDO = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9,
  J: 10, K: 11, L: 12, M: 13, N: 14, O: 15, P: 16, Q: 17,
  R: -8, S: -7, T: -6, U: -5, V: -4, W: -3, X: -2, Y: -1, Z: 0,
};

function xdo(code) {
  return [...code].filter((ch) => /[a-z]/i.test(ch)).map((ch) => XDO[ch.toUpperCase()]);
}

function fUnity() {
  return 1;
}
function uZero() {
  return 0;
}
function fMm(a) {
  const w = a.omega * D2R;
  const i = a.i * D2R;
  const I = a.I * D2R;
  const mean = (2 / 3 - Math.sin(w) ** 2) * (1 - 1.5 * Math.sin(i) ** 2);
  return (2 / 3 - Math.sin(I) ** 2) / mean;
}
function fMf(a) {
  const w = a.omega * D2R;
  const i = a.i * D2R;
  const I = a.I * D2R;
  const mean = Math.sin(w) ** 2 * Math.cos(0.5 * i) ** 4;
  return Math.sin(I) ** 2 / mean;
}
function fO1(a) {
  const w = a.omega * D2R;
  const i = a.i * D2R;
  const I = a.I * D2R;
  const mean = Math.sin(w) * Math.cos(0.5 * w) ** 2 * Math.cos(0.5 * i) ** 4;
  return (Math.sin(I) * Math.cos(0.5 * I) ** 2) / mean;
}
function fJ1(a) {
  const w = a.omega * D2R;
  const i = a.i * D2R;
  const I = a.I * D2R;
  const mean = Math.sin(2 * w) * (1 - 1.5 * Math.sin(i) ** 2);
  return Math.sin(2 * I) / mean;
}
function fOO1(a) {
  const w = a.omega * D2R;
  const i = a.i * D2R;
  const I = a.I * D2R;
  const mean = Math.sin(w) * Math.sin(0.5 * w) ** 2 * Math.cos(0.5 * i) ** 4;
  return (Math.sin(I) * Math.sin(0.5 * I) ** 2) / mean;
}
function fM2(a) {
  const w = a.omega * D2R;
  const i = a.i * D2R;
  const I = a.I * D2R;
  const mean = Math.cos(0.5 * w) ** 4 * Math.cos(0.5 * i) ** 4;
  return Math.cos(0.5 * I) ** 4 / mean;
}
function fK1(a) {
  const w = a.omega * D2R;
  const i = a.i * D2R;
  const I = a.I * D2R;
  const nu = a.nu * D2R;
  const meanFactor = Math.sin(2 * w) * (1 - 1.5 * Math.sin(i) ** 2);
  const mean = 0.5023 * meanFactor + 0.1681;
  return Math.sqrt(0.2523 * Math.sin(2 * I) ** 2 + 0.1689 * Math.sin(2 * I) * Math.cos(nu) + 0.0283) / mean;
}
function fL2(a) {
  const P = a.P * D2R;
  const I = a.I * D2R;
  const inverse = Math.sqrt(1 - 12 * Math.tan(0.5 * I) ** 2 * Math.cos(2 * P) + 36 * Math.tan(0.5 * I) ** 4);
  return fM2(a) * inverse;
}
function fK2(a) {
  const w = a.omega * D2R;
  const i = a.i * D2R;
  const I = a.I * D2R;
  const nu = a.nu * D2R;
  const meanFactor = Math.sin(w) ** 2 * (1 - 1.5 * Math.sin(i) ** 2);
  const mean = 0.5023 * meanFactor + 0.0365;
  return (
    Math.sqrt(0.2523 * Math.sin(I) ** 4 + 0.0367 * Math.sin(I) ** 2 * Math.cos(2 * nu) + 0.0013) / mean
  );
}
function fM1(a) {
  const P = a.P * D2R;
  const I = a.I * D2R;
  const inverse = Math.sqrt(
    0.25 +
      1.5 * Math.cos(I) * Math.cos(2 * P) * Math.cos(0.5 * I) ** -0.5 +
      2.25 * Math.cos(I) ** 2 * Math.cos(0.5 * I) ** -4
  );
  return fO1(a) * inverse;
}
function fModd(a, n) {
  return fM2(a) ** (n / 2);
}
function uMf(a) {
  return -2 * a.xi;
}
function uO1(a) {
  return 2 * a.xi - a.nu;
}
function uJ1(a) {
  return -a.nu;
}
function uOO1(a) {
  return -2 * a.xi - a.nu;
}
function uM2(a) {
  return 2 * a.xi - 2 * a.nu;
}
function uK1(a) {
  return -a.nup;
}
function uL2(a) {
  const I = a.I * D2R;
  const P = a.P * D2R;
  const radius = Math.atan(Math.sin(2 * P) / ((1 / 6) * Math.tan(0.5 * I) ** -2 - Math.cos(2 * P))) * R2D;
  return 2 * a.xi - 2 * a.nu - radius;
}
function uK2(a) {
  return -2 * a.nupp;
}
function uM1(a) {
  const I = a.I * D2R;
  const P = a.P * D2R;
  const q = Math.atan(((5 * Math.cos(I) - 1) / (7 * Math.cos(I) + 1)) * Math.tan(P)) * R2D;
  return a.xi - a.nu + q;
}
function uModd(a, n) {
  return (n / 2) * uM2(a);
}

const BASES = [
  ["Sa", "Z ZAZ ZZZ", uZero, fUnity],
  ["Ssa", "Z ZBZ ZZZ", uZero, fUnity],
  ["Mm", "Z AZY ZZZ", uZero, fMm],
  ["Mf", "Z BZZ ZZZ", uMf, fMf],
  ["Q1", "A XZA ZZA", uO1, fO1],
  ["O1", "A YZZ ZZA", uO1, fO1],
  ["K1", "A AZZ ZZY", uK1, fK1],
  ["J1", "A BZY ZZY", uJ1, fJ1],
  ["M1", "A ZZZ ZZA", uM1, fM1],
  ["P1", "A AXZ ZZA", uZero, fUnity],
  ["S1", "A AYZ ZZZ", uZero, fUnity],
  ["OO1", "A CZZ ZZY", uOO1, fOO1],
  ["2N2", "B XZB ZZZ", uM2, fM2],
  ["N2", "B YZA ZZZ", uM2, fM2],
  ["nu2", "B YBY ZZZ", uM2, fM2],
  ["M2", "B ZZZ ZZZ", uM2, fM2],
  ["lambda2", "B AXA ZZB", uM2, fM2],
  ["L2", "B AZY ZZB", uL2, fL2],
  ["T2", "B BWZ ZAZ", uZero, fUnity],
  ["S2", "B BXZ ZZZ", uZero, fUnity],
  ["R2", "B BYZ ZYB", uZero, fUnity],
  ["K2", "B BZZ ZZZ", uK2, fK2],
  ["M3", "C ZZZ ZZZ", (a) => uModd(a, 3), (a) => fModd(a, 3)],
].map(([name, code, u, f]) => ({ name, coeff: xdo(code), u, f }));

const BASE_BY_NAME = Object.fromEntries(BASES.map((base) => [base.name, base]));

const COMPOUNDS = {
  MSF: [["S2", 1], ["M2", -1]],
  "2Q1": [["N2", 1], ["J1", -1]],
  rho1: [["nu2", 1], ["K1", -1]],
  mu2: [["M2", 2], ["S2", -1]],
  "2SM2": [["S2", 2], ["M2", -1]],
  "2MK3": [["M2", 1], ["O1", 1]],
  MK3: [["M2", 1], ["K1", 1]],
  MN4: [["M2", 1], ["N2", 1]],
  M4: [["M2", 2]],
  MS4: [["M2", 1], ["S2", 1]],
  S4: [["S2", 2]],
  M6: [["M2", 3]],
  S6: [["S2", 3]],
  M8: [["M2", 4]],
};

const CANON = {
  SA: "Sa",
  SSA: "Ssa",
  MM: "Mm",
  MF: "Mf",
  NU2: "nu2",
  LAM2: "lambda2",
  LAMBDA2: "lambda2",
  RHO: "rho1",
  RHO1: "rho1",
  MU2: "mu2",
  MSF: "MSF",
};

export function canonicalName(name) {
  const raw = String(name || "").trim();
  const upper = raw.toUpperCase();
  if (CANON[upper]) return CANON[upper];
  if (BASE_BY_NAME[raw] || COMPOUNDS[raw]) return raw;
  if (BASE_BY_NAME[upper] || COMPOUNDS[upper]) return upper;
  return raw;
}

export function constituentTerms(utcMs) {
  return termsFor(astronomy(new Date(utcMs)));
}

function termsFor(astro) {
  const terms = {};
  for (const base of BASES) {
    let argument = 0;
    for (let i = 0; i < base.coeff.length; i += 1) argument += base.coeff[i] * astro[ARG_KEYS[i]];
    terms[base.name] = { V: argument, u: base.u(astro), f: base.f(astro) };
  }
  for (const [name, members] of Object.entries(COMPOUNDS)) {
    let argument = 0;
    let u = 0;
    let f = 1;
    for (const [member, count] of members) {
      const term = terms[member];
      argument += count * term.V;
      u += count * term.u;
      f *= term.f ** Math.abs(count);
    }
    terms[name] = { V: argument, u, f };
  }
  return terms;
}

export function heightAt(utcMs, model) {
  const terms = termsFor(astronomy(new Date(utcMs)));
  let height = model.z0;
  for (const constituent of model.constituents) {
    const term = terms[canonicalName(constituent.name)];
    if (!term || !Number.isFinite(constituent.amp)) continue;
    const radians = ((term.V + term.u - constituent.phase) * Math.PI) / 180;
    height += constituent.amp * term.f * Math.cos(radians);
  }
  return height;
}

function refineExtremum(model, aroundMs, type) {
  let lo = aroundMs - 50 * 60 * 1000;
  let hi = aroundMs + 50 * 60 * 1000;
  for (let step = 0; step < 28; step += 1) {
    const left = lo + (hi - lo) / 3;
    const right = hi - (hi - lo) / 3;
    const leftHeight = heightAt(left, model);
    const rightHeight = heightAt(right, model);
    const keepRight = type === "H" ? leftHeight < rightHeight : leftHeight > rightHeight;
    if (keepRight) lo = left;
    else hi = right;
  }
  const t = (lo + hi) / 2;
  return { t, v: heightAt(t, model), type };
}

export function predictModel(model, startMs, endMs, stepMs = 10 * 60 * 1000) {
  const series = [];
  for (let t = startMs; t <= endMs; t += stepMs) {
    series.push({ t, v: heightAt(t, model) });
  }
  const rough = [];
  for (let i = 1; i < series.length - 1; i += 1) {
    const prev = series[i - 1].v;
    const mid = series[i].v;
    const next = series[i + 1].v;
    if (mid >= prev && mid >= next && (mid > prev || mid > next)) rough.push({ t: series[i].t, type: "H" });
    if (mid <= prev && mid <= next && (mid < prev || mid < next)) rough.push({ t: series[i].t, type: "L" });
  }
  const extrema = rough.map((point) => refineExtremum(model, point.t, point.type));
  return { series, extrema };
}

function cosine(t, a, b) {
  const span = b.t - a.t || 1;
  const u = Math.min(1, Math.max(0, (t - a.t) / span));
  const weight = (1 - Math.cos(Math.PI * u)) / 2;
  return a.v * (1 - weight) + b.v * weight;
}

/** Subordinate station: shift each high and low, then draw the curve between them. */
export function predictSubordinate(model, offsets, startMs, endMs, stepMs = 10 * 60 * 1000) {
  const pad = 18 * 60 * 60 * 1000;
  const reference = predictModel(model, startMs - pad, endMs + pad, stepMs);
  const extrema = reference.extrema
    .map((point) => {
      const high = point.type === "H";
      const minutes = high ? offsets.highMin : offsets.lowMin;
      const amount = high ? offsets.high : offsets.low;
      const v = offsets.mode === "F" ? point.v + amount : point.v * amount;
      return { t: point.t + minutes * 60 * 1000, v, type: point.type };
    })
    .filter((point) => point.t >= startMs - pad && point.t <= endMs + pad)
    .sort((a, b) => a.t - b.t);
  const series = [];
  if (extrema.length >= 2) {
    for (let t = startMs; t <= endMs; t += stepMs) {
      let index = 0;
      while (index < extrema.length - 2 && extrema[index + 1].t < t) index += 1;
      series.push({ t, v: cosine(t, extrema[index], extrema[index + 1]) });
    }
  }
  return {
    series,
    extrema: extrema.filter((point) => point.t >= startMs && point.t <= endMs),
  };
}
