import { addZonedDays, civilTimeOnZonedDay, getPlace, solarElevation, startOfZonedDay } from "./time.js";

export const FORECAST_DAYS = 7;

/** Seven local days beginning with the day that contains `now`. */
export function forecastDays(extrema = [], now = new Date(), count = FORECAST_DAYS) {
  const origin = startOfZonedDay(now);
  const days = [];
  for (let i = 0; i < count; i += 1) {
    const start = addZonedDays(origin, i).getTime();
    const end = addZonedDays(origin, i + 1).getTime();
    const turns = extrema
      .filter((turn) => turn.t >= start && turn.t < end && Number.isFinite(turn.v))
      .slice()
      .sort((a, b) => a.t - b.t);
    days.push({ start, end, turns, today: i === 0 });
  }
  return days;
}

/** A tide has passed when its time is already behind the clock. */
export function tideHasPassed(turn, nowMs) {
  return Number.isFinite(turn?.t) && turn.t < nowMs;
}

export function forecastLabel(ms) {
  const timeZone = getPlace().tz;
  const date = new Date(ms);
  return {
    dow: new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date),
    dom: new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date),
    short: new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date),
  };
}

/**
 * Sunrise and sunset for the local day that begins at `dayStartMs`,
 * from the beach's latitude and longitude. Falls back to 6 AM–6 PM.
 */
export function daylightWindow(dayStartMs, lat = getPlace().lat, lon = getPlace().lon) {
  const start = new Date(dayStartMs);
  const fallback = () => ({
    sunrise: civilTimeOnZonedDay(start, 6).getTime(),
    sunset: civilTimeOnZonedDay(start, 18).getTime(),
  });
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return fallback();
  const horizon = -0.833;
  let sunrise = null;
  let sunset = null;
  let prev = solarElevation(start, lat, lon);
  for (let minute = 4; minute <= 24 * 60; minute += 4) {
    const at = new Date(dayStartMs + minute * 60000);
    const elev = solarElevation(at, lat, lon);
    if (sunrise == null && prev < horizon && elev >= horizon) sunrise = at.getTime();
    if (prev >= horizon && elev < horizon) sunset = at.getTime();
    prev = elev;
  }
  if (sunrise == null || sunset == null || sunset <= sunrise) return fallback();
  return { sunrise, sunset };
}

function extreme(list, which) {
  return list.reduce((best, turn) => {
    if (which === "high") return turn.v > best.v ? turn : best;
    return turn.v < best.v ? turn : best;
  });
}

function nearest(list, sunrise, sunset) {
  const mid = (sunrise + sunset) / 2;
  return list.reduce((best, turn) => (
    Math.abs(turn.t - mid) < Math.abs(best.t - mid) ? turn : best
  ));
}

/**
 * One daytime high and one daytime low.
 * If the daylight hours have none, the nearest tide of that kind is used and marked borrowed.
 */
export function daytimePair(turns = [], sunrise, sunset) {
  const pick = (kind) => {
    const list = turns.filter((turn) => (kind === "high" ? turn.type === "H" : turn.type !== "H"));
    if (!list.length) return null;
    const inside = list.filter((turn) => turn.t >= sunrise && turn.t <= sunset);
    if (inside.length) return { turn: extreme(inside, kind), borrowed: false };
    const turn = nearest(list, sunrise, sunset);
    return { turn, borrowed: true };
  };
  return { high: pick("high"), low: pick("low") };
}

function clock(ms) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: getPlace().tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function spanOf(pair) {
  if (!pair?.high || !pair?.low) return 0.5;
  return Math.abs(pair.high.turn.v - pair.low.turn.v);
}

export function createForecast(root) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let series = [];
  let extrema = [];
  let active = false;
  let model = [];
  let nowMs = Date.now();
  let lead = 0;
  let open = null;
  let advanceTimer = 0;

  const kioskOn = () => document.documentElement.dataset.kiosk === "1";

  const stopAdvance = () => {
    clearInterval(advanceTimer);
    advanceTimer = 0;
  };

  const startAdvance = () => {
    if (advanceTimer || !active || reduceMotion.matches || !kioskOn()) return;
    advanceTimer = window.setInterval(() => {
      if (!model.length) return;
      open = null;
      lead = (lead + 1) % model.length;
      render();
    }, 9000);
  };

  const onKey = (event) => {
    if (!active || root.hidden) return;
    if (event.key === "Escape" && open != null) {
      event.preventDefault();
      open = null;
      render();
      return;
    }
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const pills = [...root.querySelectorAll(".tide-pill")];
    if (!pills.length) return;
    const current = pills.findIndex((pill) => pill === document.activeElement);
    if (current < 0 && open == null) return;
    event.preventDefault();
    const dir = event.key === "ArrowRight" ? 1 : -1;
    const next = (current < 0 ? lead : current + dir + pills.length) % pills.length;
    if (open != null) {
      open = Number(pills[next].dataset.index);
      render();
    }
    pills[next]?.focus();
  };

  const figure = (mark, choice) => {
    const node = document.createElement("span");
    node.className = mark === "↑" ? "pill-high" : "pill-low";
    if (!choice) {
      node.textContent = "—";
      return node;
    }
    const arrow = document.createElement("span");
    arrow.className = "pill-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = mark;
    const num = document.createElement("span");
    num.className = "pill-num";
    num.textContent = choice.turn.v.toFixed(1);
    const unit = document.createElement("span");
    unit.className = "pill-unit";
    unit.textContent = " ft";
    num.append(unit);
    const time = document.createElement("span");
    time.className = "pill-time";
    time.textContent = clock(choice.turn.t);
    if (choice.borrowed) {
      const sky = document.createElement("span");
      sky.className = "pill-sky";
      sky.setAttribute("aria-hidden", "true");
      sky.textContent = choice.turn.t < choice.sunrise || choice.turn.t > choice.sunset ? "☾" : "☀";
      time.append(sky);
    }
    node.append(arrow, num, time);
    return node;
  };

  const pill = (day, index, isLead) => {
    const node = document.createElement("div");
    node.className = `tide-pill${isLead ? " is-lead" : " is-small"}${day.today ? " is-today" : ""}`;
    node.tabIndex = 0;
    node.role = "button";
    node.dataset.index = String(index);
    node.style.setProperty("--span", day.span.toFixed(3));
    const label = forecastLabel(day.start);
    const date = document.createElement("span");
    date.className = "pill-date";
    const dow = document.createElement("span");
    dow.className = "pill-dow";
    dow.textContent = day.today && index === lead ? "Today" : (isLead ? label.dow : label.short);
    const dom = document.createElement("span");
    dom.className = "pill-dom";
    dom.textContent = label.dom;
    date.append(dow, dom);
    const glow = document.createElement("span");
    glow.className = "pill-glow";
    glow.setAttribute("aria-hidden", "true");
    const high = figure("↑", day.pair.high && { ...day.pair.high, sunrise: day.sunrise, sunset: day.sunset });
    const low = figure("↓", day.pair.low && { ...day.pair.low, sunrise: day.sunrise, sunset: day.sunset });
    node.append(glow, date, high, low);
    const highText = day.pair.high ? `${day.pair.high.turn.v.toFixed(1)} feet at ${clock(day.pair.high.turn.t)}` : "no high";
    const lowText = day.pair.low ? `${day.pair.low.turn.v.toFixed(1)} feet at ${clock(day.pair.low.turn.t)}` : "no low";
    node.setAttribute("aria-label", `${label.dow}, daytime high ${highText}, daytime low ${lowText}`);
    node.addEventListener("click", () => {
      open = open === index ? null : index;
      render();
    });
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open = open === index ? null : index;
      render();
    });
    return node;
  };

  const detail = (day) => {
    const panel = document.createElement("div");
    panel.className = "forecast-detail";
    const label = forecastLabel(day.start);
    const back = document.createElement("div");
    back.className = "detail-back";
    back.tabIndex = 0;
    back.role = "button";
    back.textContent = day.today ? `Today · ${label.dow}` : label.dow;
    back.setAttribute("aria-label", `Close ${label.dow}`);
    const close = () => {
      open = null;
      render();
    };
    back.addEventListener("click", close);
    back.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      close();
    });
    const when = document.createElement("p");
    when.className = "detail-when";
    when.textContent = label.dom;
    const list = document.createElement("div");
    list.className = "detail-list";
    day.turns.forEach((turn) => {
      const row = document.createElement("p");
      const past = day.today && tideHasPassed(turn, nowMs);
      row.className = `detail-line${past ? " is-past" : ""}`;
      const time = document.createElement("span");
      time.className = "t-time";
      time.textContent = clock(turn.t);
      const arrow = document.createElement("span");
      arrow.className = "t-mark";
      arrow.textContent = turn.type === "H" ? "↑" : "↓";
      const ht = document.createElement("span");
      ht.className = "t-ht";
      ht.textContent = turn.v.toFixed(1);
      const unit = document.createElement("span");
      unit.className = "pill-unit";
      unit.textContent = " ft";
      ht.append(unit);
      row.append(time, arrow, ht);
      list.append(row);
    });
    panel.append(back, when, list);
    return { panel, back };
  };

  const render = () => {
    const place = getPlace();
    const days = forecastDays(extrema, new Date(nowMs));
    model = days.map((day) => {
      const light = daylightWindow(day.start, place.lat, place.lon);
      return { ...day, ...light, pair: daytimePair(day.turns, light.sunrise, light.sunset) };
    });
    if (!model.length) lead = 0;
    else lead = ((lead % model.length) + model.length) % model.length;
    root.replaceChildren();
    if (!series.length && !extrema.length) {
      const empty = document.createElement("p");
      empty.className = "forecast-empty";
      empty.textContent = "The week is still gathering.";
      root.append(empty);
      return;
    }
    const ranges = model.map((day) => spanOf(day.pair));
    const lowRange = Math.min(...ranges);
    const highRange = Math.max(...ranges);
    model.forEach((day) => {
      const range = spanOf(day.pair);
      day.span = highRange - lowRange < 0.25 ? 0.55 : (range - lowRange) / (highRange - lowRange);
    });
    if (open != null && model[open]) {
      const { panel, back } = detail(model[open]);
      root.append(panel);
      back.focus();
      startAdvance();
      return;
    }
    const stage = document.createElement("div");
    stage.className = "forecast-stage";
    model.forEach((day, index) => {
      stage.append(pill(day, index, index === lead));
    });
    root.append(stage);
    startAdvance();
  };

  document.addEventListener("keydown", onKey);

  return {
    setData({ series: nextSeries, extrema: nextExtrema, now }) {
      series = nextSeries ?? [];
      extrema = nextExtrema ?? [];
      nowMs = (now ?? new Date()).getTime();
      if (active) render();
    },
    setActive(on, now = new Date()) {
      active = Boolean(on);
      root.hidden = !active;
      root.setAttribute("aria-hidden", active ? "false" : "true");
      nowMs = now.getTime();
      if (!active) {
        stopAdvance();
        open = null;
        return;
      }
      render();
    },
    isActive() {
      return active;
    },
  };
}
