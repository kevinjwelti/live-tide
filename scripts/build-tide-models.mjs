/**
 * Builds src/tide-models.js.
 * US stations: NOAA CO-OPS harmonic constituents and datums (feet, MLLW via MSL−MLLW).
 * Hossegor: fitted to SHOM Capbreton official predictions (chart datum, meters → feet).
 * Other non-US spots: fitted to University of Hawaii Sea Level Center hourly series,
 * then shifted so zero is near the mean of the daily lows, and converted to feet.
 * Ericeira uses published Cascais constituents (Instituto Hidrográfico), not a fit.
 */
import { writeFileSync } from "node:fs";
import { constituentTerms, heightAt, predictModel } from "../src/harmonics.js";

const M_TO_FT = 3.280839895;
const NOAA = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations";
const FIT_NAMES = ["M2", "S2", "N2", "K2", "K1", "O1", "P1", "Q1", "nu2", "M4", "MS4"];

const REFERENCE_IDS = [
  "9410840",
  "9410660",
  "9411270",
  "8510560",
  "1612340",
  "9410170",
  "9414290",
  "9413450",
  "8651370",
];

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "live-tide" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function noaaModel(id) {
  const [harcon, datums] = await Promise.all([
    getJson(`${NOAA}/${id}/harcon.json`),
    getJson(`${NOAA}/${id}/datums.json`),
  ]);
  const rows = harcon.HarmonicConstituents || [];
  if (!rows.length) throw new Error(`No constituents for ${id}`);
  const msl = datums.datums.find((row) => row.name === "MSL")?.value;
  const mllw = datums.datums.find((row) => row.name === "MLLW")?.value;
  if (msl == null || mllw == null) throw new Error(`No MSL/MLLW for ${id}`);
  return {
    z0: round(msl - mllw, 4),
    constituents: rows.map((row) => ({
      name: row.name,
      amp: round(Number(row.amplitude), 4),
      phase: round(Number(row.phase_GMT), 2),
    })),
  };
}

function round(n, places) {
  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
}

function solve(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const scale = a[col][col];
    if (Math.abs(scale) < 1e-12) throw new Error("Singular tide fit");
    for (let j = col; j <= n; j += 1) a[col][j] /= scale;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function fitSeries(samples, names) {
  const columns = 1 + names.length * 2;
  const normal = Array.from({ length: columns }, () => Array(columns).fill(0));
  const rhs = Array(columns).fill(0);
  for (const sample of samples) {
    const row = [1];
    const terms = sample.terms;
    for (const name of names) {
      const term = terms[name];
      const angle = ((term.V + term.u) * Math.PI) / 180;
      row.push(term.f * Math.cos(angle), term.f * Math.sin(angle));
    }
    for (let i = 0; i < columns; i += 1) {
      rhs[i] += row[i] * sample.v;
      for (let j = 0; j < columns; j += 1) normal[i][j] += row[i] * row[j];
    }
  }
  const beta = solve(normal, rhs);
  const constituents = [];
  names.forEach((name, index) => {
    const cosine = beta[1 + index * 2];
    const sine = beta[2 + index * 2];
    const amp = Math.hypot(cosine, sine);
    if (amp < 1e-4) return;
    let phase = (Math.atan2(sine, cosine) * 180) / Math.PI;
    if (phase < 0) phase += 360;
    constituents.push({ name, amp: round(amp, 4), phase: round(phase, 2) });
  });
  return { z0: round(beta[0], 4), constituents };
}

function fitTimes(samples) {
  const withTerms = samples.map((sample) => ({
    ...sample,
    terms: constituentTerms(sample.t),
  }));
  return fitSeries(withTerms, FIT_NAMES);
}

function meanDailyLow(model, startMs, endMs) {
  const { series } = predictModel(model, startMs, endMs, 30 * 60 * 1000);
  const days = new Map();
  for (const point of series) {
    const key = new Date(point.t).toISOString().slice(0, 10);
    const prev = days.get(key);
    if (prev == null || point.v < prev) days.set(key, point.v);
  }
  const lows = [...days.values()];
  return lows.reduce((sum, value) => sum + value, 0) / lows.length;
}

async function shomSamples() {
  const base = "https://services.data.shom.fr/b2q8lrcdl4s04cbabsj4nhcb/hdm/spm/wl";
  const chunks = ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"];
  const samples = [];
  for (const date of chunks) {
    const url = `${base}?harborName=CAPBRETON&date=${date}&utc=0&duration=30&nbWaterLevels=24`;
    const res = await fetch(url, {
      headers: { "User-Agent": "live-tide", Referer: "https://maree.shom.fr/" },
    });
    if (!res.ok) throw new Error(`SHOM ${res.status}`);
    const json = await res.json();
    for (const [day, rows] of Object.entries(json)) {
      if (!Array.isArray(rows)) continue;
      for (const [clock, height] of rows) {
        const t = Date.parse(`${day}T${clock}Z`);
        if (Number.isFinite(t) && Number.isFinite(Number(height))) {
          samples.push({ t, v: Number(height) * M_TO_FT });
        }
      }
    }
  }
  const unique = new Map(samples.map((sample) => [sample.t, sample]));
  return [...unique.values()].sort((a, b) => a.t - b.t);
}

async function uhslcSamples(dataset, constraint, start, end) {
  const split = constraint.indexOf("=");
  const query = `${constraint.slice(0, split)}=${encodeURIComponent(constraint.slice(split + 1))}`;
  const url =
    `https://uhslc.soest.hawaii.edu/erddap/tabledap/${dataset}.csv?time,sea_level&` +
    `${query}&time>=${start}&time<=${end}`;
  const res = await fetch(url, { headers: { "User-Agent": "live-tide" } });
  if (!res.ok) throw new Error(`UHSLC ${res.status} ${constraint}`);
  const text = await res.text();
  const samples = [];
  for (const line of text.split("\n").slice(2)) {
    if (!line.trim()) continue;
    const [time, level] = line.split(",");
    const t = Date.parse(time);
    const mm = Number(level);
    if (Number.isFinite(t) && Number.isFinite(mm)) samples.push({ t, v: mm });
  }
  return samples;
}

async function uhslcModel(label, dataset, constraint, ranges) {
  let samples = [];
  for (const [start, end] of ranges) {
    try {
      samples = await uhslcSamples(dataset, constraint, start, end);
      if (samples.length > 500) break;
    } catch (error) {
      console.warn(label, error.message);
    }
  }
  if (samples.length < 500) throw new Error(`${label} series too short (${samples.length})`);
  const fitted = await fitTimes(samples);
  const low = meanDailyLow(fitted, samples[0].t, samples[samples.length - 1].t);
  const mmToFt = M_TO_FT / 1000;
  return {
    z0: round((fitted.z0 - low) * mmToFt, 4),
    constituents: fitted.constituents.map((row) => ({
      ...row,
      amp: round(row.amp * mmToFt, 4),
    })),
    samples: samples.length,
  };
}

function ericeiraModel() {
  // Instituto Hidrográfico, Cascais constituents (published table, chart datum).
  // Cascais is about 30 km south of Ericeira. Centimetres converted to feet.
  const rows = [
    ["M2", 0.988, 64.2],
    ["S2", 0.35, 90.6],
    ["K1", 0.07, 54.1],
    ["O1", 0.06, 314.5],
  ];
  return {
    z0: round(2 * M_TO_FT, 4),
    constituents: rows.map(([name, meters, phase]) => ({
      name,
      amp: round(meters * M_TO_FT, 4),
      phase,
    })),
  };
}

function js(value) {
  return JSON.stringify(value, null, 2);
}

async function main() {
  const models = {};
  for (const id of REFERENCE_IDS) {
    models[id] = await noaaModel(id);
    console.log("noaa", id, "constituents", models[id].constituents.length, "z0", models[id].z0);
  }

  const world = { ericeira: ericeiraModel() };
  console.log("fitting Hossegor / Capbreton…");
  const shom = await shomSamples();
  console.log("  samples", shom.length);
  world.hossegor = await fitTimes(shom);
  console.log("  constituents", world.hossegor.constituents.map((row) => row.name).join(" "));

  const ranges = [
    ["2024-01-01T00:00:00Z", "2024-07-01T00:00:00Z"],
    ["2023-01-01T00:00:00Z", "2023-07-01T00:00:00Z"],
  ];
  const research = [
    ["2015-01-01T00:00:00Z", "2015-07-01T00:00:00Z"],
    ["2012-01-01T00:00:00Z", "2012-07-01T00:00:00Z"],
    ["2008-01-01T00:00:00Z", "2008-07-01T00:00:00Z"],
  ];
  console.log("fitting Uluwatu / Benoa…");
  world.uluwatu = await uhslcModel("Benoa", "global_hourly_fast", 'station_name="Benoa"', ranges);
  console.log("fitting Jeffreys / Port Elizabeth…");
  world.jeffreys = await uhslcModel(
    "Port Elizabeth",
    "global_hourly_fast",
    'station_name="Port Elizabeth"',
    ranges
  );
  console.log("fitting Snapper / Brisbane…");
  world.snapper = await uhslcModel("Brisbane", "global_hourly_fast", 'station_name="Brisbane"', ranges);
  console.log("fitting Puerto Escondido / Puerto Angel…");
  world.puerto = await uhslcModel(
    "Puerto Angel",
    "global_hourly_rqds",
    'station_name="Puerto Angel"',
    [["1980-01-01T00:00:00Z", "1980-07-01T00:00:00Z"], ...research]
  );

  const subordinates = {
    "1612668": { ref: "1612340", mode: "R", high: 0.8, low: 0.8, highMin: -62, lowMin: -125 },
    "9410583": { ref: "9410660", mode: "R", high: 0.96, low: 0.96, highMin: -9, lowMin: 0 },
    TWC0419: { ref: "9410170", mode: "R", high: 0.92, low: 0.92, highMin: -15, lowMin: -11 },
    "9414275": { ref: "9414290", mode: "F", high: 0.1, low: 0, highMin: -49, lowMin: -35 },
    "9413745": { ref: "9413450", mode: "R", high: 0.97, low: 0.99, highMin: -6, lowMin: -11 },
    "8652226": { ref: "8651370", mode: "R", high: 1.04, low: 1.43, highMin: -5, lowMin: 1 },
  };

  const file = `/* Generated by scripts/build-tide-models.mjs. Do not edit by hand.
 * NOAA models: CO-OPS harcon.json + datums.json, feet above MLLW (z0 = MSL − MLLW).
 * Subordinate offsets: CO-OPS tidepredoffsets.json, used only when the predictions API is down.
 * ericeira: Instituto Hidrográfico constituents for Cascais (M2 98.8 cm 64.2°, S2 35.0 cm 90.6°,
 *   K1 7.0 cm 54.1°, O1 6.0 cm 314.5°, Z0 2.00 m), about 30 km south of Ericeira. Feet, chart datum.
 * hossegor: least-squares fit to SHOM Capbreton official predictions, feet, chart datum.
 *   Capbreton is the pass beside Hossegor.
 * uluwatu: fit to UHSLC hourly Benoa (station 163), then shifted to the mean of daily lows. Feet.
 *   Benoa is about 20 km from Uluwatu.
 * jeffreys: fit to UHSLC hourly Port Elizabeth (station 184), same datum shift. Feet.
 *   Port Elizabeth is about 75 km from Jeffreys Bay.
 * snapper: fit to UHSLC hourly Brisbane (station 331), same datum shift. Feet.
 *   Brisbane is about 80 km north of Snapper Rocks, so the times can lead or lag the beach.
 * puerto: fit to UHSLC research-quality hourly Puerto Angel (station 672), same datum shift. Feet.
 *   Puerto Angel is about 70 km east of Puerto Escondido.
 */
export const NOAA_MODELS = ${js(models)};

export const SUBORDINATES = ${js(subordinates)};

export const WORLD_MODELS = ${js({
    ericeira: world.ericeira,
    hossegor: world.hossegor,
    uluwatu: { z0: world.uluwatu.z0, constituents: world.uluwatu.constituents },
    jeffreys: { z0: world.jeffreys.z0, constituents: world.jeffreys.constituents },
    snapper: { z0: world.snapper.z0, constituents: world.snapper.constituents },
    puerto: { z0: world.puerto.z0, constituents: world.puerto.constituents },
  })};
`;
  writeFileSync(new URL("../src/tide-models.js", import.meta.url), file);
  console.log("wrote src/tide-models.js");

  const santa = heightAt(Date.parse("2026-10-11T16:52:00Z"), models["9410840"]);
  console.log("Santa Monica harmonic at NOAA high 16:52Z", santa.toFixed(3), "ft (official high is 6.05)");

  const ericeira = predictModel(
    world.ericeira,
    Date.parse("2026-10-11T00:00:00Z"),
    Date.parse("2026-10-12T00:00:00Z"),
    10 * 60 * 1000
  );
  console.log("Ericeira / Cascais extrema UTC");
  for (const point of ericeira.extrema) {
    console.log(" ", point.type, new Date(point.t).toISOString(), (point.v / M_TO_FT).toFixed(2), "m");
  }

  const hossegor = predictModel(
    world.hossegor,
    Date.parse("2026-10-11T00:00:00Z"),
    Date.parse("2026-10-12T00:00:00Z"),
    10 * 60 * 1000
  );
  console.log("Hossegor extrema UTC (SHOM Capbreton that day: high 03:37 4.19m, low 09:35 0.59m, high 15:54 4.28m, low 21:57 0.62m local UTC+1)");
  for (const point of hossegor.extrema) {
    console.log(" ", point.type, new Date(point.t).toISOString(), (point.v / M_TO_FT).toFixed(2), "m");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
