import "./style.css";
import { createSwell } from "./swell.js";
import { createChart } from "./chart.js";
import { fetchTide, REFRESH_MS } from "./tide.js";
import { moonState, renderMoon } from "./moon.js";
import { formatClock, formatDate, setPlace } from "./time.js";
import { applyMood, pickMood } from "./moods.js";
import { initSkyMode, listenForSkyMessages, resolveNow } from "./now.js";
import { initKiosk, isKiosk, KIOSK_RETRY_START_MS, nextRetryDelay } from "./kiosk.js";
import { rememberBeach, resolveInitialBeach, writeBeachParam } from "./beaches.js";
import { initBeachMenu } from "./beach-menu.js";
import { createForecast } from "./forecast.js";
import { cachedStations, loadStations, upgradeBeach } from "./stations.js";

const params = new URLSearchParams(location.search);
if (params.get("embed") === "1") {
  document.documentElement.dataset.embed = "1";
}

initSkyMode();
listenForSkyMessages();

let beach = resolveInitialBeach(location.search);
const stationCache = cachedStations();
if (stationCache) {
  const upgraded = upgradeBeach(beach, stationCache);
  if (upgraded.name !== beach.name) beach = upgraded;
}
setPlace(beach);
const kiosk = isKiosk();
if (kiosk) initKiosk();
const embed = params.get("embed") === "1";
let mood = applyMood(pickMood(resolveNow()));

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
  forecastToggle: document.querySelector("#forecast-toggle"),
  tideEyebrow: document.querySelector("#tide-eyebrow"),
  chartStage: document.querySelector("#chart-stage"),
  moodCaption: document.querySelector("#mood-caption"),
};

const swell = createSwell();
const chart = createChart(els.chartStage);
const forecast = createForecast(document.querySelector("#forecast"), {
  onOpenDay(day) {
    if (day) {
      chart.showForecastDay(day.start, { live: day.today });
      chart.setShown(true);
      return;
    }
    chart.clearForecastDay();
    if (forecast.isActive()) chart.setShown(false);
  },
});

function setStatus(text) {
  els.statusMsg.hidden = !text;
  els.statusMsg.textContent = text ?? "";
}

function applyPlace() {
  els.placeName.textContent = beach.name;
  if (els.credit) els.credit.textContent = beach.credit;
}

function applyCaption() {
  if (!els.moodCaption) return;
  const forced = params.get("mood");
  els.moodCaption.textContent = forced ? `Preview: ${mood.name}` : `Today: ${mood.name}`;
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
    const show = tomorrow || chart.hasDay(1) || !chart.hasData();
    els.dayFlip.hidden = !show;
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
  if (exploring && Math.abs(timeMs - resolveNow().getTime()) > 5000) {
    els.scrubNote.hidden = false;
    els.scrubNote.textContent = formatClock(new Date(timeMs));
  } else {
    els.scrubNote.hidden = true;
  }
}

chart.onView((timeMs, sample, exploring, meta) => {
  renderTideReadout(timeMs, sample, exploring);
  const washTime = meta?.dayOffset === 1 ? resolveNow() : new Date(timeMs);
  swell.setTime(washTime);
});

let retryMs = KIOSK_RETRY_START_MS;
let retryTimer = 0;

function scheduleQuietRetry() {
  if (!kiosk) return;
  clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => loadTide("retry"), retryMs);
  retryMs = nextRetryDelay(retryMs);
}

function applyTideData(data) {
  if (els.credit) {
    els.credit.textContent =
      beach.id === "boom" && data.source === "harmonics"
        ? "Tide predictions in feet · NOAA harmonics · Puerto Corinto"
        : beach.credit;
  }
  const view = chart.setData({
    series: data.series,
    extrema: data.extrema,
    now: resolveNow(),
  });
  forecast.setData({
    series: data.series,
    extrema: data.extrema,
    now: resolveNow(),
  });
  syncDayFlip();
  if (kiosk) {
    setStatus("");
    return;
  }
  if (view?.empty) {
    setStatus("No tide curve yet.");
  } else if (chart.dayOffset() === 1 && !chart.hasDay(1)) {
    setStatus("Tomorrow’s curve is not ready yet.");
  } else {
    setStatus("");
  }
}

let loadToken = 0;

function selectBeach(next) {
  beach = next;
  rememberBeach(next);
  writeBeachParam(next.id);
  setPlace(next);
  applyPlace();
  if (!params.get("mood")) {
    mood = applyMood(pickMood(resolveNow()));
    applyCaption();
  }
  chart.setDayOffset(0);
  syncDayFlip();
  pulse(resolveNow());
  loadTide("beach");
}

async function loadTide(reason = "refresh") {
  const token = ++loadToken;
  const requested = beach;
  if (!kiosk) setStatus(reason === "init" ? "Gathering the tide…" : "");
  try {
    const data = await fetchTide(requested);
    if (token !== loadToken) return;
    const keepLast = kiosk && data.live === false && chart.hasData();
    if (!keepLast) applyTideData(data);
    if (kiosk && data.live === false) scheduleQuietRetry();
    else if (kiosk) {
      retryMs = KIOSK_RETRY_START_MS;
      clearTimeout(retryTimer);
    }
  } catch (error) {
    console.warn(error);
    if (kiosk) {
      scheduleQuietRetry();
      return;
    }
    if (!chart.hasData()) {
      setStatus(requested.id === "boom" ? "The Boom tide file has not landed yet." : "The tide didn't answer.");
    }
  }
}

function pulse(now = resolveNow()) {
  renderClock(now);
  renderMoonPanel(now);
  chart.tick(now);
}

function showForecast(on, { updateUrl = true } = {}) {
  document.documentElement.dataset.view = on ? "forecast" : "today";
  if (updateUrl) {
    const url = new URL(location.href);
    if (on) url.searchParams.set("view", "forecast");
    else url.searchParams.delete("view");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  if (els.forecastToggle) {
    els.forecastToggle.textContent = on ? "Today" : "Forecast";
    els.forecastToggle.setAttribute("aria-pressed", on ? "true" : "false");
    els.forecastToggle.setAttribute(
      "aria-label",
      on ? "Show today's tide" : "Show the seven day forecast"
    );
  }
  if (on) {
    chart.setShown(false);
    forecast.setActive(true, resolveNow());
  } else {
    forecast.setActive(false, resolveNow());
    chart.setShown(true);
  }
}

els.forecastToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  showForecast(!forecast.isActive());
});

document.addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  if (forecast.isActive()) return;
  if (event.target?.closest?.("input, textarea")) return;
  const menu = document.querySelector("#beach-menu");
  if (menu && !menu.hidden) return;
  const toggle = els.forecastToggle;
  if (!toggle || toggle.offsetParent === null) return;
  event.preventDefault();
  if (document.activeElement === toggle && (event.key === "ArrowUp" || event.key === "ArrowLeft")) {
    els.placeName?.focus();
    return;
  }
  toggle.focus();
});

els.dayFlip?.addEventListener("click", (event) => {
  event.stopPropagation();
  const next = chart.dayOffset() === 1 ? 0 : 1;
  chart.setDayOffset(next);
  syncDayFlip();
  if (next === 1 && !chart.hasDay(1)) {
    setStatus("Tomorrow’s curve is not ready yet.");
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

window.addEventListener("livetide-sky", () => {
  pulse(resolveNow());
});

initBeachMenu({
  button: els.placeName,
  getBeach: () => beach,
  onSelect: selectBeach,
  enabled: !kiosk && !embed,
});

if (params.get("beach")) rememberBeach(beach);
else if (beach.id !== "boom") writeBeachParam(beach.id);

loadStations()
  .then((rows) => {
    const upgraded = upgradeBeach(beach, rows);
    if (upgraded.name !== beach.name || upgraded.tz !== beach.tz) selectBeach(upgraded);
  })
  .catch(() => {});

applyPlace();
applyCaption();
syncDayFlip();
if (params.get("view") === "forecast") showForecast(true, { updateUrl: false });
pulse(resolveNow());
loadTide("init");

setInterval(() => {
  pulse(resolveNow());
}, 1000);

setInterval(() => {
  loadTide("refresh");
}, REFRESH_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadTide("visible");
});
