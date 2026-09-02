import { formatClock, startOfZonedDay, startOfNextZonedDay, skyPalette, isNightScene } from "./time.js";
import { sampleTide } from "./tide.js";
import { moonState, renderMoon, renderSun } from "./moon.js";

const PAD = { top: 0.2, bottom: 0.26, left: 0.03, right: 0.04 };

function layout(w, h, series, rangeStart, rangeEnd) {
  const left = w * PAD.left;
  const right = w * (1 - PAD.right);
  const top = h * PAD.top;
  const bottom = h * (1 - PAD.bottom);
  const values = series.map((p) => p.v);
  let min = Math.min(0, ...values);
  let max = Math.max(3, ...values);
  const pad = Math.max(0.4, (max - min) * 0.12);
  min -= pad;
  max += pad;
  const x = (t) => left + ((t - rangeStart) / (rangeEnd - rangeStart)) * (right - left);
  const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
  return { left, right, top, bottom, min, max, x, y };
}

function curvePath(ctx, series, L, from, to) {
  const pts = series.filter((p) => p.t >= from - 400000 && p.t <= to + 400000);
  if (pts.length < 2) return;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const px = L.x(p.t);
    const py = L.y(p.v);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
}

export function createChart(stage) {
  const canvas = stage.querySelector("#chart");
  const ctx = canvas.getContext("2d");
  const nowLine = stage.querySelector("#now-line");
  const playLine = stage.querySelector("#playhead-line");
  const playhead = stage.querySelector("#playhead");
  const orb = playhead?.querySelector("#playhead-orb");
  const yAxis = stage.querySelector("#y-axis");
  const labelsEl = stage.querySelector("#extremum-labels");
  const hit = stage.querySelector("#chart-hit") ?? stage;

  let series = [];
  let extrema = [];
  let L = null;
  let rangeStart = 0;
  let rangeEnd = 1;
  let viewTime = Date.now();
  let scrubbing = false;
  let idleTimer = 0;
  let anim = null;
  let listeners = { onView: () => {} };
  let orbKey = "";

  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  };

  const paint = () => {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    if (series.length < 2) return;
    L = layout(w, h, series, rangeStart, rangeEnd);

    ctx.save();
    curvePath(ctx, series, L, rangeStart, rangeEnd);
    const lastX = L.x(Math.min(rangeEnd, series[series.length - 1].t));
    ctx.lineTo(lastX, L.bottom);
    ctx.lineTo(L.x(rangeStart), L.bottom);
    ctx.closePath();
    const mist = ctx.createLinearGradient(0, L.top, 0, L.bottom);
    mist.addColorStop(0, "rgba(252, 246, 238, 0.10)");
    mist.addColorStop(1, "rgba(252, 246, 238, 0.02)");
    ctx.fillStyle = mist;
    ctx.fill();
    ctx.restore();

    ctx.save();
    curvePath(ctx, series, L, rangeStart, rangeEnd);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(44, 38, 34, 0.22)";
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = "rgba(252, 248, 242, 0.94)";
    ctx.lineWidth = 1.55;
    ctx.stroke();
    ctx.restore();

    yAxis.replaceChildren();

    labelsEl.replaceChildren();
    const todayExtrema = extrema.filter((e) => e.t >= rangeStart && e.t <= rangeEnd);
    todayExtrema.forEach((e) => {
      const node = document.createElement("div");
      node.className = "extremum";
      const px = L.x(e.t);
      const py = L.y(e.v);
      node.style.left = `${px}px`;
      node.style.top = `${L.bottom + 8}px`;
      const kind = e.type === "H" ? "HIGH TIDE" : "LOW TIDE";
      node.innerHTML = `<div class="t-time">${formatClock(new Date(e.t))}</div>
        <div class="t-kind">${kind}</div>
        <div class="t-ht">${e.v.toFixed(1)} ft</div>`;
      labelsEl.append(node);

      ctx.beginPath();
      ctx.arc(px, py, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = "#c9a15c";
      ctx.strokeStyle = "rgba(44, 38, 34, 0.35)";
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();
    });
  };

  const xToTime = (clientX) => {
    if (!L) return Date.now();
    const rect = stage.getBoundingClientRect();
    const x = clientX - rect.left;
    const u = (x - L.left) / (L.right - L.left);
    const clamped = Math.min(1, Math.max(0, u));
    return rangeStart + clamped * (rangeEnd - rangeStart);
  };

  const paintOrb = (timeMs) => {
    if (!playhead || !orb) return;
    const light = skyPalette(new Date(timeMs));
    const night = isNightScene(light);
    playhead.classList.toggle("is-sun", !night);
    playhead.classList.toggle("is-moon", night);
    const moon = moonState(new Date(timeMs));
    const key = night ? `m:${moon.phase.toFixed(3)}` : "sun";
    if (key === orbKey) return;
    orbKey = key;
    if (night) {
      renderMoon(orb, moon, {
        lit: "#eef3f8",
        shade: "#141b26",
        rim: "#c5d4e8",
      });
    } else {
      renderSun(orb);
    }
  };

  const placeMarks = (timeMs) => {
    if (!L || !series.length) return;
    const sample = sampleTide(series, timeMs);
    const now = Date.now();
    const nx = L.x(Math.min(rangeEnd, Math.max(rangeStart, now)));
    nowLine.style.opacity = "1";
    nowLine.style.left = `${nx}px`;
    if (!sample) return;
    const px = L.x(Math.min(rangeEnd, Math.max(rangeStart, timeMs)));
    const py = L.y(sample.height);
    const exploring = scrubbing || Boolean(anim) || Math.abs(timeMs - now) > 8000;
    playhead.style.opacity = "1";
    playhead.style.left = `${px}px`;
    playhead.style.top = `${py}px`;
    playhead.classList.toggle("live", !exploring);
    playhead.classList.toggle("exploring", exploring);
    paintOrb(timeMs);
    if (playLine) {
      playLine.style.opacity = exploring ? "1" : "0";
      playLine.style.left = `${px}px`;
    }
  };

  const emit = () => {
    listeners.onView(viewTime, sampleTide(series, viewTime), scrubbing || Boolean(anim));
    placeMarks(viewTime);
  };

  const easeToNow = () => {
    const from = viewTime;
    const t0 = performance.now();
    const dur = 1100;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      viewTime = from + (Date.now() - from) * e;
      if (u < 1 && !scrubbing) {
        anim = requestAnimationFrame(step);
      } else {
        anim = null;
        viewTime = Date.now();
      }
      emit();
    };
    if (anim) cancelAnimationFrame(anim);
    anim = requestAnimationFrame(step);
  };

  const onPointerDown = (event) => {
    if (!series.length) return;
    scrubbing = true;
    if (anim) cancelAnimationFrame(anim);
    anim = null;
    clearTimeout(idleTimer);
    hit.setPointerCapture(event.pointerId);
    viewTime = xToTime(event.clientX);
    emit();
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (!scrubbing) return;
    viewTime = xToTime(event.clientX);
    emit();
    event.preventDefault();
  };

  const onPointerUp = (event) => {
    if (!scrubbing) return;
    scrubbing = false;
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(easeToNow, 2000);
    event.preventDefault();
  };

  const preventScroll = (event) => {
    if (event.cancelable) event.preventDefault();
  };

  hit.addEventListener("pointerdown", onPointerDown);
  hit.addEventListener("pointermove", onPointerMove);
  hit.addEventListener("pointerup", onPointerUp);
  hit.addEventListener("pointercancel", onPointerUp);
  hit.addEventListener("touchstart", preventScroll, { passive: false });
  hit.addEventListener("touchmove", preventScroll, { passive: false });

  window.addEventListener("resize", () => {
    paint();
    placeMarks(viewTime);
  });

  return {
    setData({ series: nextSeries, extrema: nextExtrema, now }) {
      series = nextSeries;
      extrema = nextExtrema;
      const origin = now ?? new Date();
      rangeStart = startOfZonedDay(origin).getTime();
      rangeEnd = startOfNextZonedDay(origin).getTime();
      if (!scrubbing && !anim) viewTime = origin.getTime();
      paint();
      emit();
    },
    tick(now) {
      if (!scrubbing && !anim) viewTime = now.getTime();
      emit();
    },
    onView(fn) {
      listeners.onView = fn;
    },
    hasData() {
      return series.length > 1;
    },
  };
}
