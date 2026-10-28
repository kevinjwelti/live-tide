import { canvasStyle } from "./moods.js";
import { sampleTide } from "./tide.js";
import { addZonedDays, getPlace, startOfZonedDay } from "./time.js";

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

export function forecastLabel(ms) {
  const timeZone = getPlace().tz;
  const date = new Date(ms);
  return {
    dow: new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(date),
    dom: new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(date),
  };
}

function rgbOf(color) {
  const match = String(color).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function withAlpha(color, alpha) {
  const rgb = rgbOf(color);
  const a = Math.max(0, Math.min(1, alpha));
  if (!rgb) return `rgba(255, 236, 214, ${a})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

function moodColor(style, night) {
  const inner = night ? style.inner?.night : style.inner?.day;
  if (rgbOf(inner)) return inner;
  if (style.twin) return night ? style.twin.b.color : style.twin.a.color;
  return night ? "rgba(214, 226, 240, 0.9)" : "rgba(255, 236, 214, 0.9)";
}

function clock(ms) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: getPlace().tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function createForecast(root) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let series = [];
  let extrema = [];
  let active = false;
  let frame = 0;
  let lastMs = 0;
  let phase = 0;
  let canvases = [];

  const night = () => document.documentElement.dataset.light === "night";

  const paintCanvas = (canvas, day, shift) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const steps = 48;
    const heights = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = day.start + ((day.end - day.start) * i) / steps;
      const sample = sampleTide(series, t);
      if (sample) heights.push(sample.height);
    }
    if (heights.length < 2) return;
    let min = Math.min(...heights);
    let max = Math.max(...heights);
    const pad = Math.max(0.2, (max - min) * 0.22);
    min -= pad;
    max += pad;
    const span = max - min || 1;
    const top = h * 0.22;
    const bottom = h * 0.82;
    const yOf = (v) => bottom - ((v - min) / span) * (bottom - top);
    const xOf = (i) => (i / (heights.length - 1)) * (w - 1);

    const trace = () => {
      ctx.beginPath();
      heights.forEach((v, i) => {
        const py = yOf(v) - shift;
        if (i === 0) ctx.moveTo(xOf(i), py);
        else ctx.lineTo(xOf(i), py);
      });
    };

    const darkNight = night();
    const tint = moodColor(canvasStyle(), darkNight);
    const rgb = rgbOf(tint);
    const dark = rgb ? rgb[0] + rgb[1] + rgb[2] < 280 : false;
    const glow = dark
      ? (darkNight ? "rgba(236, 226, 208, 0.9)" : "rgba(255, 244, 228, 0.95)")
      : tint;

    ctx.save();
    trace();
    ctx.lineTo(xOf(heights.length - 1), h + 2);
    ctx.lineTo(xOf(0), h + 2);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, top, 0, h);
    body.addColorStop(0, withAlpha(tint, darkNight ? 0.22 : 0.3));
    body.addColorStop(1, withAlpha(tint, 0));
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    trace();
    ctx.strokeStyle = withAlpha(glow, 0.12);
    ctx.lineWidth = 7;
    ctx.stroke();
    trace();
    ctx.strokeStyle = withAlpha(glow, 0.38);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  };

  const paint = (shift) => {
    canvases.forEach((entry) => paintCanvas(entry.canvas, entry.day, shift));
  };

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastMs = 0;
  };

  const loop = (now) => {
    frame = requestAnimationFrame(loop);
    if (!active || document.hidden || reduceMotion.matches) return;
    if (!lastMs) {
      lastMs = now;
      return;
    }
    const dt = now - lastMs;
    if (dt < 33) return;
    lastMs = now;
    phase += (Math.min(dt, 80) / 11000) * Math.PI * 2;
    paint(Math.sin(phase) * 1.4);
  };

  const start = () => {
    paint(reduceMotion.matches ? 0 : Math.sin(phase) * 1.4);
    if (reduceMotion.matches || !active) return;
    if (!frame) frame = requestAnimationFrame(loop);
  };

  let advanceTimer = 0;

  const stopAdvance = () => {
    clearInterval(advanceTimer);
    advanceTimer = 0;
  };

  const startAdvance = () => {
    stopAdvance();
    if (!active || reduceMotion.matches) return;
    if (document.documentElement.dataset.kiosk !== "1") return;
    advanceTimer = window.setInterval(() => {
      const list = root.querySelector(".forecast-days");
      const rows = [...(list?.querySelectorAll(".forecast-day") ?? [])];
      if (!list || rows.length < 2) return;
      const max = list.scrollHeight - list.clientHeight;
      if (max < 12) return;
      const edge = list.getBoundingClientRect().top;
      const index = rows.findIndex((row) => row.getBoundingClientRect().top >= edge - 8);
      const nextIndex = index < 0 ? 0 : (index + 1) % rows.length;
      const dest = nextIndex === 0
        ? 0
        : list.scrollTop + (rows[nextIndex].getBoundingClientRect().top - edge);
      list.scrollTo({ top: dest, behavior: "smooth" });
    }, 9000);
  };

  const render = (now = new Date()) => {
    const days = forecastDays(extrema, now);
    const hasCurve = series.length > 1;
    const hasTurns = days.some((day) => day.turns.length);
    root.replaceChildren();
    canvases = [];
    stopAdvance();
    if (!hasCurve && !hasTurns) {
      const empty = document.createElement("p");
      empty.className = "forecast-empty";
      empty.textContent = "The week is still gathering.";
      root.append(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "forecast-days";
    days.forEach((day) => {
      const card = document.createElement("article");
      card.className = `forecast-day${day.today ? " is-today" : ""}`;
      const canvas = document.createElement("canvas");
      canvas.className = "forecast-wave";
      canvas.setAttribute("aria-hidden", "true");
      const label = forecastLabel(day.start);
      const date = document.createElement("p");
      date.className = "forecast-date";
      if (day.today) {
        const badge = document.createElement("span");
        badge.className = "forecast-today";
        badge.textContent = "Today";
        date.append(badge);
      }
      const dow = document.createElement("span");
      dow.className = "forecast-dow";
      dow.textContent = label.dow;
      const dom = document.createElement("span");
      dom.className = "forecast-dom";
      dom.textContent = label.dom;
      date.append(dow, dom);
      const turns = document.createElement("div");
      turns.className = "forecast-turns";
      day.turns.forEach((turn) => {
        const node = document.createElement("p");
        const low = turn.type !== "H";
        node.className = `forecast-turn${low ? " is-low" : " is-high"}`;
        const mark = document.createElement("span");
        mark.className = "t-mark";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = low ? "↓" : "↑";
        const kind = document.createElement("span");
        kind.className = "t-kind";
        kind.textContent = low ? "Low" : "High";
        const ht = document.createElement("span");
        ht.className = "t-ht";
        ht.textContent = turn.v.toFixed(1);
        const unit = document.createElement("span");
        unit.className = "t-unit";
        unit.textContent = " ft";
        ht.append(unit);
        const time = document.createElement("span");
        time.className = "t-time";
        time.textContent = clock(turn.t);
        node.append(mark, kind, ht, time);
        turns.append(node);
      });
      card.append(canvas, date, turns);
      list.append(card);
      canvases.push({ canvas, day });
    });
    root.append(list);
    requestAnimationFrame(() => {
      if (!active) return;
      start();
      startAdvance();
    });
  };

  reduceMotion.addEventListener("change", () => {
    if (!active) return;
    if (reduceMotion.matches) stop();
    start();
  });
  document.addEventListener("visibilitychange", () => {
    if (!active) return;
    if (document.hidden) {
      stop();
      return;
    }
    start();
  });
  window.addEventListener("livetide-mood", () => {
    if (active) paint(reduceMotion.matches ? 0 : Math.sin(phase) * 1.4);
  });
  window.addEventListener("livetide-sky", () => {
    if (active) paint(reduceMotion.matches ? 0 : Math.sin(phase) * 1.4);
  });

  return {
    setData({ series: nextSeries, extrema: nextExtrema, now }) {
      series = nextSeries ?? [];
      extrema = nextExtrema ?? [];
      if (active) render(now ?? new Date());
    },
    setActive(on, now = new Date()) {
      active = Boolean(on);
      root.hidden = !active;
      root.setAttribute("aria-hidden", active ? "false" : "true");
      if (!active) {
        stop();
        stopAdvance();
        return;
      }
      render(now);
    },
    isActive() {
      return active;
    },
  };
}
