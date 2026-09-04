#!/usr/bin/env node
/**
 * Server-side only. Fetches Surfline Corinto tides (no Origin header)
 * and writes public/data/boom-tides.json for same-origin Pages.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SPOT_ID = "61d4d151c15a827dc58364ec";
const SURFLINE =
  `https://services.surfline.com/kbyg/spots/forecasts/tides?spotId=${SPOT_ID}&days=3&intervalHours=1`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/data/boom-tides.json");

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

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return null;
  }
}

async function readSource() {
  const fromFlag = process.argv.indexOf("--from");
  if (fromFlag >= 0 && process.argv[fromFlag + 1]) {
    return JSON.parse(await readFile(process.argv[fromFlag + 1], "utf8"));
  }

  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const res = await fetch(SURFLINE, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Surfline HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastErr = error;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr ?? new Error("Surfline fetch failed");
}

const existing = await loadExisting();
try {
  const json = await readSource();
  const parsed = parseSurfline(json);
  if (!parsed.series.length) throw new Error("Surfline returned no tide curve");
  const loc = json?.associated?.tideLocation ?? {};
  const payload = {
    station: "boom-corinto",
    source: "surfline",
    spotId: SPOT_ID,
    location: {
      name: loc.name ?? "Corinto, Isla Cardon",
      lat: loc.lat ?? 12.4833,
      lon: loc.lon ?? -87.1667,
    },
    fetchedAt: Date.now(),
    series: parsed.series,
    extrema: parsed.extrema,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(payload)}\n`);
  console.log(
    `Wrote ${OUT} (${payload.series.length} pts, ${payload.extrema.length} extrema)`
  );
} catch (error) {
  if (existing?.series?.length) {
    console.warn(`Surfline fetch failed (${error.message}); keeping existing boom-tides.json`);
    process.exit(0);
  }
  console.error(error.message ?? error);
  process.exit(1);
}
