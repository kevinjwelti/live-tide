import "./style.css";
import { createSwell } from "./swell.js";
import { createChart } from "./chart.js";
import { fetchTide, STATION, REFRESH_MS } from "./tide.js";
import { moonState, renderMoon } from "./moon.js";
import { formatClock, formatDate, setPlace } from "./time.js";

const els = {
  direction: document.querySelector("#direction"),
  dirMark: document.querySelector("#dir-mark"),
  height: document.querySelector("#height"),
  scrubNote: document.querySelector("#scrub-note"),
  placeName: document.querySelector("#place-name"),
  dateLine: document.querySelector("#date-line"),
  clockLine: document.querySelector("#clock-line"),
  statusMsg: document.querySelector("#status-msg"),
  moonName: document.querySelector("#moon-name"),
  moonPct: document.querySelector("#moon-pct"),
  moonIcon: document.querySelector("#moon-icon"),
  credit: document.querySelector("#credit"),
  dayFlip: document.querySelector("#day-flip"),
  tideEyebrow: document.querySelector("#tide-eyebrow"),
  chartStage: document.querySelector("#chart-stage"),
};

setPlace(STATION);
const swell = createSwell();
const chart = createChart(els.chartStage);

function setStatus(text) {
  els.statusMsg.hidden = !text;
  els.statusMsg.textContent = text ?? "";
}

function applyPlace() {
  els.placeName.textContent = STATION.name;
  if (els.credit) els.credit.textContent = STATION.credit;
}

function syncDayFlip() {
  const tomorrow = chart.dayOffset() === 1;
  document.documentElement.dataset.forecast = tomorrow ? "tomorrow" : "today";
  if (els.tideEyebrow) {
    els.tideEyebrow.textContent = tomorrow ? "TOMORROW" : "CURRENT TIDE";
  }
  if (els.chartStage) {
    els.chartStage.setAttribute(
      "aria-label",
      tomorrow ? "Tomorrow's tide curve" : "Today's tide curve"
    );
  }
  if (els.dayFlip) {
    els.dayFlip.hidden = !tomorrow && !chart.hasDay(1);
    els.dayFlip.textContent = tomorrow ? "Today" : "Tomorrow";
    els.dayFlip.setAttribute("aria-pressed", tomorrow ? "true" : "false");
    els.dayFlip.setAttribute(
      "aria-label",
      tomorrow ? "Show today's tide" : "Show tomorrow's tide"
    );
  }
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

chart.onView((timeMs, sample, exploring, meta) => {
  renderTideReadout(timeMs, sample, exploring);
  const washTime = meta?.dayOffset === 1 ? new Date() : new Date(timeMs);
  swell.setTime(washTime);
});

async function loadTide(reason = "refresh") {
  setStatus(reason === "init" ? "Gathering the tide…" : "");
  try {
    const data = await fetchTide();
    if (els.credit) {
      els.credit.textContent =
        data.source === "harmonics"
          ? "Tide predictions in feet · NOAA harmonics · Puerto Corinto"
          : STATION.credit;
    }
    const view = chart.setData({
      series: data.series,
      extrema: data.extrema,
      now: new Date(),
    });
    syncDayFlip();
    if (view?.empty) {
      setStatus("No tide curve in the file yet.");
    } else if (chart.dayOffset() === 1 && !chart.hasDay(1)) {
      setStatus("Tomorrow’s curve is not in the file yet.");
    } else if (view?.stale && view.lastT) {
      setStatus(`Tide file ends ${formatClock(new Date(view.lastT))} · showing last available curve`);
    } else {
      setStatus("");
    }
  } catch (error) {
    console.warn(error);
    if (!chart.hasData()) {
      setStatus(error?.message || "The Boom tide file has not landed yet.");
    }
  }
}

els.dayFlip?.addEventListener("click", (event) => {
  event.stopPropagation();
  const next = chart.dayOffset() === 1 ? 0 : 1;
  chart.setDayOffset(next);
  syncDayFlip();
  if (next === 1 && !chart.hasDay(1)) {
    setStatus("Tomorrow’s curve is not in the file yet.");
  } else {
    setStatus("");
  }
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

applyPlace();
syncDayFlip();
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
