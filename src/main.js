import "./style.css";
import { createSwell } from "./swell.js";
import { createChart } from "./chart.js";
import {
  fetchTide,
  loadSavedStation,
  saveStation,
  nextStation,
  REFRESH_MS,
} from "./tide.js";
import { moonState, renderMoon } from "./moon.js";
import { formatClock, formatDate } from "./time.js";

const els = {
  direction: document.querySelector("#direction"),
  dirMark: document.querySelector("#dir-mark"),
  height: document.querySelector("#height"),
  scrubNote: document.querySelector("#scrub-note"),
  placeName: document.querySelector("#place-name"),
  placeSub: document.querySelector("#place-sub"),
  dateLine: document.querySelector("#date-line"),
  clockLine: document.querySelector("#clock-line"),
  stationBtn: document.querySelector("#station-btn"),
  statusMsg: document.querySelector("#status-msg"),
  moonName: document.querySelector("#moon-name"),
  moonPct: document.querySelector("#moon-pct"),
  moonIcon: document.querySelector("#moon-icon"),
};

let station = loadSavedStation();
createSwell();
const chart = createChart(document.querySelector("#chart-stage"));

function setStatus(text) {
  els.statusMsg.hidden = !text;
  els.statusMsg.textContent = text ?? "";
}

function renderStation() {
  els.placeName.textContent = station.name;
  els.placeSub.textContent = station.hint;
}

function renderMoonPanel(now) {
  const moon = moonState(now);
  els.moonName.textContent = moon.name;
  els.moonPct.textContent = `${Math.round(moon.illumination * 100)}%`;
  renderMoon(els.moonIcon, moon);
}

function renderClock(now) {
  els.dateLine.textContent = formatDate(now);
  els.clockLine.textContent = formatClock(now);
}

function renderTideReadout(timeMs, sample, exploring) {
  if (!sample) {
    els.direction.textContent = "—";
    els.height.textContent = "—";
    els.dirMark.className = "dir-mark";
    return;
  }
  const rising = sample.slope >= 0;
  els.direction.textContent = rising ? "RISING" : "FALLING";
  els.dirMark.className = `dir-mark ${rising ? "rising" : "falling"}`;
  els.height.textContent = sample.height.toFixed(1);
  if (exploring && Math.abs(timeMs - Date.now()) > 5000) {
    els.scrubNote.hidden = false;
    els.scrubNote.textContent = formatClock(new Date(timeMs));
  } else {
    els.scrubNote.hidden = true;
  }
}

chart.onView((timeMs, sample, exploring) => {
  renderTideReadout(timeMs, sample, exploring);
});

async function loadTide(reason = "refresh") {
  setStatus(reason === "init" ? "Gathering the tide…" : "");
  try {
    const data = await fetchTide(station.id);
    chart.setData({ series: data.series, extrema: data.extrema, now: new Date() });
    setStatus("");
  } catch (error) {
    console.warn(error);
    if (!chart.hasData()) setStatus("The tide is out of reach just now.");
  }
}

els.stationBtn.addEventListener("click", async () => {
  station = nextStation(station.id);
  saveStation(station.id);
  renderStation();
  setStatus("Shifting waters…");
  await loadTide("switch");
});

document.querySelector(".wordmark").addEventListener("click", async () => {
  const root = document.documentElement;
  try {
    if (!document.fullscreenElement && root.requestFullscreen) {
      await root.requestFullscreen();
    }
    screen.orientation?.lock?.("landscape").catch(() => {});
  } catch {
    /* Safari may require Add to Home Screen for true fullscreen */
  }
});

document.addEventListener(
  "touchmove",
  (event) => {
    if (event.cancelable) event.preventDefault();
  },
  { passive: false }
);

renderStation();
renderMoonPanel(new Date());
renderClock(new Date());
loadTide("init");

setInterval(() => {
  const now = new Date();
  renderClock(now);
  renderMoonPanel(now);
  chart.tick(now);
}, 1000);

setInterval(() => {
  loadTide("refresh");
}, REFRESH_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadTide("visible");
});

void swell;
