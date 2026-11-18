#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { tvBackAction, tvClickTarget, tvShouldWake } from "../src/tv-remote.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(tvBackAction({}) === "exit", "back exits when nothing is open");
assert(tvBackAction({ pickerOpen: true, forecastOpen: true }) === "close-picker", "back closes the scene picker first");
assert(tvBackAction({ forecastDetail: true, forecastOpen: true }) === "close-detail", "back closes a forecast day before the forecast");
assert(tvBackAction({ forecastOpen: true }) === "close-forecast", "back leaves the forecast for today");

assert(tvShouldWake({ tv: true }) === true, "the first remote press wakes the controls");
assert(tvShouldWake({ tv: true, awake: true }) === false, "an awake remote does not restart focus");
assert(tvShouldWake({ tv: true, pickerOpen: true }) === false, "an open picker is already awake");
assert(tvShouldWake({ tv: false }) === false, "a normal browser does not use the TV wake");

assert(tvClickTarget({ tagName: "BUTTON", className: "", getAttribute: () => null }, { trusted: false }), "OK presses a button");
assert(!tvClickTarget({ tagName: "BUTTON", className: "", getAttribute: () => null }, { trusted: true }), "a real keyboard click is left to the browser");
assert(tvClickTarget({ tagName: "DIV", className: "tide-pill is-lead", getAttribute: () => null }), "OK opens a forecast day");

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert(html.includes('dataset.tv = "1"'), "the page can mark itself as the TV app");
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
assert(sw.includes("boom-tides.json"), "the tide file is part of the offline cache");
assert(readFileSync(new URL("../privacy.html", import.meta.url), "utf8").includes("Live Tide"), "privacy page exists");

console.log("tv remote tests passed");
