#!/usr/bin/env node
/**
 * Server-side only. Prefer live Surfline Corinto tides (no Origin header).
 * Always request several days ahead. If Cloudflare blocks the fetch, synthesize
 * Puerto Corinto harmonics for yesterday through the next week. Fail the job
 * unless the written file reaches end-of-tomorrow in America/Managua.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CORINTO_EXTREMA } from "./corinto-extrema.mjs";
import { fromHarmonics } from "../src/corinto-harmonics.js";
import {
  assertForecastCoverage,
  coverageReport,
  ensureForecastCoverage,
} from "../src/tide-coverage.js";
import { setPlace } from "../src/time.js";

setPlace({ tz: "America/Managua", lat: 12.635, lon: -87.361 });

const SPOT_ID = "61d4d151c15a827dc58364ec";
const SURFLINE_DAYS = 10;
const SURFLINE =
  `https://services.surfline.com/kbyg/spots/forecasts/tides?spotId=${SPOT_ID}&days=${SURFLINE_DAYS}&intervalHours=1`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/data/boom-tides.json");
const M_TO_FT = 3.28084;

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
    return { series, extrema };
  }
  return { series, extrema };
}

function fromCorintoTable() {
  const extrema = CORINTO_EXTREMA.map(([iso, type, meters]) => ({
    t: Date.parse(iso),
    v: Number((meters * M_TO_FT).toFixed(3)),
    type,
  })).sort((a, b) => a.t - b.t);

  const start = extrema[0].t - 2 * 3600000;
  const end = extrema[extrema.length - 1].t + 2 * 3600000;
  const series = [];
  for (let t = start; t <= end; t += 3600000) {
    series.push({ t, v: Number(sampleBetween(extrema, t).toFixed(3)) });
  }
  return { series, extrema };
}

function sampleBetween(extrema, t) {
  if (t <= extrema[0].t) return extrema[0].v;
  if (t >= extrema[extrema.length - 1].t) return extrema[extrema.length - 1].v;
  let i = 0;
  while (i < extrema.length - 1 && extrema[i + 1].t < t) i += 1;
  const a = extrema[i];
  const b = extrema[i + 1];
  const u = (t - a.t) / (b.t - a.t || 1);
  return (a.v + b.v) / 2 + ((a.v - b.v) / 2) * Math.cos(Math.PI * u);
}

async function trySurfline() {
  const fromFlag = process.argv.indexOf("--from");
  if (fromFlag >= 0 && process.argv[fromFlag + 1]) {
    return parseSurfline(JSON.parse(await readFile(process.argv[fromFlag + 1], "utf8")));
  }
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(SURFLINE, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Surfline HTTP ${res.status}`);
      const parsed = parseSurfline(await res.json());
      if (!parsed.series.length) throw new Error("Surfline returned no tide curve");
      return { ...parsed, via: "surfline" };
    } catch (error) {
      lastErr = error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr ?? new Error("Surfline fetch failed");
}

function envelope(parsed, via) {
  return {
    station: "boom-corinto",
    source: via,
    extended: Boolean(parsed.filled),
    spotId: SPOT_ID,
    location: {
      name: "Corinto, Isla Cardon",
      lat: 12.4833,
      lon: -87.1667,
    },
    fetchedAt: Date.now(),
    series: parsed.series,
    extrema: parsed.extrema,
  };
}

function finalize(parsed, via) {
  const covered = ensureForecastCoverage(parsed, Date.now());
  assertForecastCoverage(covered.series, Date.now());
  const source = via === "surfline" ? "surfline" : "harmonics";
  return envelope(covered, source);
}

let payload;
try {
  payload = finalize(await trySurfline(), "surfline");
  console.log("Using live Surfline Corinto tides");
} catch (error) {
  console.warn(`Surfline blocked (${error.message}); synthesizing Puerto Corinto harmonics`);
  try {
    payload = finalize(fromHarmonics(Date.now()), "harmonics");
  } catch (harmonicError) {
    console.warn(`Harmonics failed (${harmonicError.message}); using published HIGH/LOW table`);
    payload = finalize(fromCorintoTable(), "table");
  }
}

const report = coverageReport(payload.series, Date.now());
if (!report.ok) {
  console.error(
    `Refusing to write short tide file (last ${new Date(report.last).toISOString()}, need ${new Date(report.tomorrowEnd).toISOString()})`
  );
  process.exit(1);
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(payload)}\n`);
console.log(
  `Wrote ${OUT} (${payload.series.length} pts, ${payload.extrema.length} extrema, ${payload.source}` +
    `${payload.extended ? "+extended" : ""}; through ${new Date(report.last).toISOString()})`
);
