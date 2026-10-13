import { civilTimeOnZonedDay } from "./time.js";

const SKY_HOURS = { noon: 12, dusk: 18, night: 22 };

let skyMode = "now";

function readSkyParam() {
  if (typeof location === "undefined") return "now";
  const value = new URLSearchParams(location.search).get("sky");
  if (value === "noon" || value === "dusk" || value === "night" || value === "now") {
    return value;
  }
  return "now";
}

export function initSkyMode() {
  skyMode = readSkyParam();
  return skyMode;
}

export function getSkyMode() {
  return skyMode;
}

export function setSkyMode(mode) {
  skyMode = SKY_HOURS[mode] != null || mode === "now" ? mode : "now";
  window.dispatchEvent(new CustomEvent("livetide-sky", { detail: skyMode }));
}

/** Wall clock, or a pinned civil time on today's local day for mood previews. */
export function resolveNow(wall = new Date()) {
  const hour = SKY_HOURS[skyMode];
  if (hour == null) return wall;
  return civilTimeOnZonedDay(wall, hour, 0, 0);
}

export function listenForSkyMessages() {
  window.addEventListener("message", (event) => {
    const mode = event.data?.sky;
    if (mode === "noon" || mode === "dusk" || mode === "night" || mode === "now") {
      setSkyMode(mode);
    }
  });
}
