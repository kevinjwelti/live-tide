#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertForecastCoverage, coverageReport } from "../src/tide-coverage.js";
import { setPlace } from "../src/time.js";

setPlace({ tz: "America/Managua", lat: 12.635, lon: -87.361 });

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, "public/data/boom-tides.json");
const json = JSON.parse(await readFile(FILE, "utf8"));
const report = assertForecastCoverage(json.series ?? [], Date.now());
const extra = coverageReport(json.series ?? [], Date.now());
console.log(
  `Coverage OK: ${new Date(extra.first).toISOString()} → ${new Date(extra.last).toISOString()} ` +
    `(need through ${new Date(report.tomorrowEnd).toISOString()})`
);
