/**
 * Puerto Corinto (NOAA 9662957) harmonic synthesis.
 * Used when live Surfline is blocked. Constituents are feet, GMT phase.
 * Time base and Z0 were fit to the published Sep 2026 Corinto HIGH/LOW table.
 */
export const CORINTO_CONSTITUENTS = [
  { name: "M2", amp: 2.89, phase: 245.4, speed: 28.984104 },
  { name: "S2", amp: 0.62, phase: 313.5, speed: 30.0 },
  { name: "N2", amp: 0.67, phase: 211.1, speed: 28.43973 },
  { name: "K1", amp: 0.34, phase: 93.5, speed: 15.041069 },
  { name: "M4", amp: 0.06, phase: 178.3, speed: 57.96821 },
  { name: "O1", amp: 0.17, phase: 112.9, speed: 13.943035 },
  { name: "NU2", amp: 0.13, phase: 215.7, speed: 28.512583 },
  { name: "MU2", amp: 0.07, phase: 3.0, speed: 27.968208 },
  { name: "2N2", amp: 0.09, phase: 176.8, speed: 27.895355 },
  { name: "LAM2", amp: 0.02, phase: 277.0, speed: 29.455626 },
  { name: "Q1", amp: 0.03, phase: 122.6, speed: 13.398661 },
  { name: "T2", amp: 0.04, phase: 310.7, speed: 29.958933 },
  { name: "P1", amp: 0.11, phase: 94.9, speed: 14.958931 },
  { name: "L2", amp: 0.08, phase: 279.7, speed: 29.528479 },
  { name: "K2", amp: 0.17, phase: 319.0, speed: 30.082138 },
  { name: "M8", amp: 0.02, phase: 307.1, speed: 115.93642 },
];

const ORIGIN = Date.UTC(1983, 0, 1);
const SHIFT_H = -1;
const Z0 = 3.918;

export function harmonicHeight(timeMs) {
  const hours = (timeMs - ORIGIN) / 3600000 + SHIFT_H;
  let h = Z0;
  for (const c of CORINTO_CONSTITUENTS) {
    const rad = ((c.speed * hours - c.phase) * Math.PI) / 180;
    h += c.amp * Math.cos(rad);
  }
  return h;
}

function refineExtremum(t0, type) {
  let bestT = t0;
  let bestV = harmonicHeight(t0);
  for (let dt = -90 * 60000; dt <= 90 * 60000; dt += 6 * 60000) {
    const t = t0 + dt;
    const v = harmonicHeight(t);
    if (type === "H" ? v > bestV : v < bestV) {
      bestT = t;
      bestV = v;
    }
  }
  return { t: bestT, v: Number(bestV.toFixed(3)), type };
}

function extremaFromHourly(series) {
  const extrema = [];
  for (let i = 1; i < series.length - 1; i += 1) {
    const a = series[i - 1].v;
    const b = series[i].v;
    const c = series[i + 1].v;
    if (b > a && b >= c) extrema.push(refineExtremum(series[i].t, "H"));
    else if (b < a && b <= c) extrema.push(refineExtremum(series[i].t, "L"));
  }
  return extrema;
}

/** Hourly curve + HIGH/LOW for [now-36h, now+96h]. */
export function fromHarmonics(now = Date.now()) {
  const start = now - 36 * 3600000;
  const end = now + 96 * 3600000;
  const series = [];
  for (let t = start; t <= end; t += 3600000) {
    series.push({ t, v: Number(harmonicHeight(t).toFixed(3)) });
  }
  return { series, extrema: extremaFromHourly(series) };
}
