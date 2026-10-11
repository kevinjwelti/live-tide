import {
  formatClock,
  startOfZonedDay,
  startOfNextZonedDay,
  addZonedDays,
  clockOnZonedDay,
  skyPalette,
  isNightScene,
  getPlace,
} from "./time.js";
import { sampleTide } from "./tide.js";
import { moonState, renderMoon, renderSun } from "./moon.js";
import { canvasStyle } from "./moods.js";
import { breathLight, breathPeriodMs, breathSwell, tideBreathLevel } from "./breath.js";

function chartPad(w, h) {
  const phone = Math.min(w, h) < 640;
  const portrait = h > w;
  return {
    top: phone && !portrait ? 0.1 : phone ? 0.14 : 0.2,
    bottom: phone ? (portrait ? 0.32 : 0.36) : 0.26,
    left: phone ? 0.045 : 0.03,
    right: phone ? 0.09 : 0.07,
  };
}

function layout(w, h, series, rangeStart, rangeEnd) {
  const inset = chartPad(w, h);
  const left = w * inset.left;
  const right = w * (1 - inset.right);
  const top = h * inset.top;
  const bottom = h * (1 - inset.bottom);
  const visible = series.filter((p) => p.t >= rangeStart && p.t <= rangeEnd);
  const values = (visible.length ? visible : series).map((p) => p.v);
  let min = Math.min(0, ...values);
  let max = Math.max(3, ...values);
  const vPad = Math.max(0.4, (max - min) * 0.12);
  min -= vPad;
  max += vPad;
  const x = (t) => left + ((t - rangeStart) / (rangeEnd - rangeStart)) * (right - left);
  const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);
  return { left, right, top, bottom, min, max, x, y };
}

function curvePath(ctx, series, L, from, to, yShift = 0) {
  // Neighbor points outside the day keep the spline smooth at midnight.
  // Never cap at "now" / the playhead — the full local day must stay visible.
  // yShift is a visual lift in pixels. Tide samples stay on the unshifted curve.
  const pts = series.filter((p) => p.t >= from - 12 * 3600000 && p.t <= to + 12 * 3600000);
  if (pts.length < 2) return;
  const py = (v) => L.y(v) - yShift;
  ctx.beginPath();
  ctx.moveTo(L.x(pts[0].t), py(pts[0].v));
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const x1 = L.x(p1.t);
    const x2 = L.x(p2.t);
    const c1x = x1 + (x2 - x1) / 3;
    const c2x = x1 + (2 * (x2 - x1)) / 3;
    const c1y = py(p1.v + (p2.v - p0.v) / 6);
    const c2y = py(p2.v - (p3.v - p1.v) / 6);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x2, py(p2.v));
  }
}

function pointsInDay(series, startMs, endMs) {
  const pad = 3 * 3600000;
  return series.filter((p) => p.t >= startMs - pad && p.t <= endMs + pad);
}

function paintGrid(ctx, L) {
  ctx.save();
  ctx.strokeStyle = "rgba(160, 210, 255, 0.18)";
  ctx.lineWidth = 1;
  const stepX = Math.max(28, (L.right - L.left) / 16);
  const stepY = Math.max(22, (L.bottom - L.top) / 8);
  for (let x = L.left; x <= L.right + 0.5; x += stepX) {
    ctx.beginPath();
    ctx.moveTo(x, L.top);
    ctx.lineTo(x, L.bottom);
    ctx.stroke();
  }
  for (let y = L.top; y <= L.bottom + 0.5; y += stepY) {
    ctx.beginPath();
    ctx.moveTo(L.left, y);
    ctx.lineTo(L.right, y);
    ctx.stroke();
  }
  ctx.restore();
}

function paintTicks(ctx, L) {
  ctx.save();
  ctx.strokeStyle = "rgba(230, 244, 255, 0.45)";
  ctx.lineWidth = 1;
  const mid = (L.top + L.bottom) / 2;
  for (let x = L.left; x <= L.right; x += Math.max(36, (L.right - L.left) / 12)) {
    ctx.beginPath();
    ctx.moveTo(x, mid - 5);
    ctx.lineTo(x, mid + 5);
    ctx.stroke();
  }
  ctx.restore();
}

function paintBleed(ctx, series, L, from, to, yShift) {
  ctx.save();
  curvePath(ctx, series, L, from, to, yShift);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(70, 140, 190, 0.12)";
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.strokeStyle = "rgba(70, 140, 190, 0.2)";
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.restore();
}

function paintTwin(ctx, series, L, from, to, twin) {
  for (const layer of [twin.a, twin.b]) {
    ctx.save();
    ctx.translate(layer.dx, layer.dy);
    curvePath(ctx, series, L, from, to);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.width;
    ctx.stroke();
    ctx.restore();
  }
}

function paintTorn(ctx, series, L, from, to, night, yShift) {
  ctx.save();
  curvePath(ctx, series, L, from, to, yShift);
  const lastX = L.x(Math.min(to, series[series.length - 1].t));
  ctx.lineTo(lastX, L.bottom + 10);
  ctx.lineTo(L.x(from), L.bottom + 10);
  ctx.closePath();
  ctx.fillStyle = night ? "rgba(18, 18, 18, 0.55)" : "rgba(246, 238, 220, 0.72)";
  ctx.fill();
  ctx.restore();
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
  let dayOffset = 0;
  let originMs = Date.now();
  let chipKey = "";
  let scrubbing = false;
  let idleTimer = 0;
  let anim = null;
  let listeners = { onView: () => {} };
  let orbKey = "";
  let clockMs = Date.now();
  let viewW = 0;
  let viewH = 0;
  let breathPhase = 0;
  let swellPx = 0;
  let breathGlow = 0.7;
  let causticShift = 0;
  let tideLevel = 0.5;
  let tideRising = true;
  let lastBreathMs = 0;
  let breathFrame = 0;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const motionReduced = () => reduceMotion.matches;

  const size = () => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (w === viewW && h === viewH && canvas.width === bw && canvas.height === bh) {
      return { w, h };
    }
    viewW = w;
    viewH = h;
    canvas.width = bw;
    canvas.height = bh;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  };

  const ampScale = () => {
    if (!L) return 1;
    return Math.min(1.35, Math.max(0.85, (L.bottom - L.top) / 420));
  };

  const syncTide = () => {
    const sample = sampleTide(series, clockMs);
    if (!sample) return;
    const day = extrema.filter((e) => e.t >= rangeStart && e.t <= rangeEnd);
    if (day.length) {
      const lo = Math.min(...day.map((e) => e.v));
      const hi = Math.max(...day.map((e) => e.v));
      tideLevel = tideBreathLevel(sample.height, lo, hi);
    } else if (L) {
      tideLevel = tideBreathLevel(sample.height, L.min, L.max);
    }
    tideRising = sample.slope >= 0;
  };

  const advanceBreath = (dt) => {
    syncTide();
    const period = breathPeriodMs(tideLevel);
    breathPhase += (dt / period) * Math.PI * 2;
    if (breathPhase > Math.PI * 8) breathPhase -= Math.PI * 2;
    swellPx = breathSwell(breathPhase, tideLevel) * ampScale();
    breathGlow = breathLight(breathPhase, tideRising);
    causticShift += dt * 0.012;
  };

  const holdBreath = () => {
    syncTide();
    swellPx = 0;
    causticShift = 0;
    breathGlow = breathLight(Math.PI / 2, tideRising);
  };

  const liveCursor = (now = new Date()) => {
    if (dayOffset === 0) return now.getTime();
    return clockOnZonedDay(new Date(rangeStart), now).getTime();
  };

  const paint = () => {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    if (series.length < 2) {
      labelsEl?.replaceChildren();
      return;
    }
    L = layout(w, h, series, rangeStart, rangeEnd);
    const style = canvasStyle();
    const night = document.documentElement.dataset.light === "night";

    if (style.grid) paintGrid(ctx, L);
    if (style.bleed) paintBleed(ctx, series, L, rangeStart, rangeEnd, swellPx);

    const shift = swellPx;
    ctx.save();
    curvePath(ctx, series, L, rangeStart, rangeEnd, shift);
    const lastX = L.x(Math.min(rangeEnd, series[series.length - 1].t));
    ctx.lineTo(lastX, L.bottom + 2);
    ctx.lineTo(L.x(rangeStart), L.bottom + 2);
    ctx.closePath();
    const mist = ctx.createLinearGradient(0, L.top, 0, L.bottom + 2);
    mist.addColorStop(0, style.mistTop);
    mist.addColorStop(1, style.mistBottom);
    ctx.fillStyle = mist;
    const body = style.showMist === false ? 1.15 : 1;
    ctx.globalAlpha = Math.min(1, body * (0.88 + breathGlow * 0.14));
    ctx.fill();
    ctx.restore();

    if (style.torn) paintTorn(ctx, series, L, rangeStart, rangeEnd, night, shift);
    paintCaustics();
    paintGlow(shift);
    paintShimmer(shift);
    if (style.twin) paintTwin(ctx, series, L, rangeStart, rangeEnd, style.twin);

    ctx.save();
    curvePath(ctx, series, L, rangeStart, rangeEnd);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const outerW = night ? style.outerWidth.night : style.outerWidth.day;
    const innerW = night ? style.innerWidth.night : style.innerWidth.day;
    if (outerW) {
      ctx.strokeStyle = night ? style.outer.night : style.outer.day;
      ctx.lineWidth = outerW;
      ctx.stroke();
    }
    if (innerW) {
      ctx.strokeStyle = night ? style.inner.night : style.inner.day;
      ctx.lineWidth = innerW;
      ctx.stroke();
    }
    ctx.restore();

    if (style.ticks) paintTicks(ctx, L);

    if (yAxis?.childNodes.length) yAxis.replaceChildren();
    paintDots();
    paintChips();
  };

  const paintGlow = (shift) => {
    const night = document.documentElement.dataset.light === "night";
    const ink = night ? "190, 214, 235" : "255, 244, 224";
    ctx.save();
    curvePath(ctx, series, L, rangeStart, rangeEnd, shift);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(${ink}, ${0.06 + breathGlow * 0.1})`;
    ctx.lineWidth = 7 + breathGlow * 5;
    ctx.stroke();
    ctx.restore();
  };

  const paintCaustics = () => {
    if (!L) return;
    const night = document.documentElement.dataset.light === "night";
    const ink = night ? "210, 224, 240" : "255, 248, 236";
    ctx.save();
    curvePath(ctx, series, L, rangeStart, rangeEnd, swellPx);
    const lastX = L.x(Math.min(rangeEnd, series[series.length - 1].t));
    ctx.lineTo(lastX, L.bottom + 2);
    ctx.lineTo(L.x(rangeStart), L.bottom + 2);
    ctx.closePath();
    ctx.clip();
    ctx.lineCap = "round";
    ctx.lineWidth = 1;
    for (let band = 0; band < 3; band += 1) {
      const y0 = L.top + (L.bottom - L.top) * (0.46 + band * 0.15);
      const amp = 2.2 + band;
      const freq = 0.016 + band * 0.004;
      ctx.beginPath();
      let started = false;
      for (let x = L.left; x <= L.right; x += 8) {
        const y = y0 + Math.sin(x * freq + causticShift * (0.32 + band * 0.06) + band * 1.7) * amp;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = `rgba(${ink}, ${0.035 + breathGlow * 0.035})`;
      ctx.stroke();
    }
    ctx.restore();
  };

  const paintShimmer = (shift) => {
    if (!L) return;
    const sample = sampleTide(series, viewTime);
    if (!sample) return;
    const px = L.x(Math.min(rangeEnd, Math.max(rangeStart, viewTime)));
    const surfaceY = L.y(sample.height) - shift;
    const night = document.documentElement.dataset.light === "night";
    const hot = night ? "198, 216, 240" : "255, 226, 168";
    const alpha = 0.05 + breathGlow * 0.16;
    const depth = (48 + breathGlow * 64) * ampScale();
    const half = 9 + breathGlow * 22;
    ctx.save();
    curvePath(ctx, series, L, rangeStart, rangeEnd, shift);
    const lastX = L.x(Math.min(rangeEnd, series[series.length - 1].t));
    ctx.lineTo(lastX, L.bottom + 2);
    ctx.lineTo(L.x(rangeStart), L.bottom + 2);
    ctx.closePath();
    ctx.clip();
    const shaft = ctx.createLinearGradient(0, surfaceY, 0, surfaceY + depth);
    shaft.addColorStop(0, `rgba(${hot}, ${alpha})`);
    shaft.addColorStop(0.42, `rgba(${hot}, ${alpha * 0.4})`);
    shaft.addColorStop(1, `rgba(${hot}, 0)`);
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(px - 4, surfaceY);
    ctx.bezierCurveTo(
      px - half * 0.4,
      surfaceY + depth * 0.28,
      px - half,
      surfaceY + depth * 0.7,
      px - 1.2,
      surfaceY + depth
    );
    ctx.lineTo(px + 1.2, surfaceY + depth);
    ctx.bezierCurveTo(
      px + half,
      surfaceY + depth * 0.7,
      px + half * 0.4,
      surfaceY + depth * 0.28,
      px + 4,
      surfaceY
    );
    ctx.closePath();
    ctx.fill();
    const pool = ctx.createRadialGradient(px, surfaceY + 2, 0, px, surfaceY + 2, half);
    pool.addColorStop(0, `rgba(${hot}, ${Math.min(0.34, alpha + 0.08)})`);
    pool.addColorStop(1, `rgba(${hot}, 0)`);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(px, surfaceY + 3, half * 0.9, 4 + breathGlow * 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const floatPlayhead = () => {
    if (!playhead) return;
    const bob = motionReduced() ? 0 : -swellPx * 0.35;
    playhead.style.transform = `translateY(${(-18 + bob).toFixed(2)}px)`;
    playhead.style.setProperty("--breath", breathGlow.toFixed(3));
  };

  const paintDots = () => {
    if (!L) return;
    const style = canvasStyle();
    if (style.showDots === false) return;
    extrema
      .filter((e) => e.t >= rangeStart && e.t <= rangeEnd)
      .forEach((e) => {
        ctx.beginPath();
        ctx.arc(L.x(e.t), L.y(e.v), style.dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = style.dotFill;
        ctx.strokeStyle = style.dotStroke;
        ctx.lineWidth = style.dotWidth;
        ctx.fill();
        ctx.stroke();
      });
  };

  const paintChips = () => {
    if (!L || !labelsEl) return;
    const key = `${rangeStart}:${rangeEnd}`;
    if (key === chipKey && labelsEl.childNodes.length) return;
    chipKey = key;
    labelsEl.replaceChildren();
    const w = stage.clientWidth;
    const dayExtrema = extrema.filter((e) => e.t >= rangeStart && e.t <= rangeEnd);
    const placed = [];
    dayExtrema.forEach((e) => {
      const node = document.createElement("div");
      node.className = "extremum";
      const px = L.x(e.t);
      node.style.top = `${L.bottom + 8}px`;
      const kind = e.type === "H" ? "HIGH TIDE" : "LOW TIDE";
      node.innerHTML = `<div class="t-time">${formatClock(new Date(e.t))}</div>
        <div class="t-kind">${kind}</div>
        <div class="t-ht">${e.v.toFixed(1)} ft</div>`;
      labelsEl.append(node);
      const hw = node.offsetWidth / 2;
      const left = Math.min(w - hw - 4, Math.max(hw + 4, px));
      const overlap = placed.some((p) => Math.abs(left - p.left) < hw + p.hw + 8);
      if (overlap) {
        node.remove();
        return;
      }
      node.style.left = `${left}px`;
      placed.push({ left, hw });
    });
  };

  const xToTime = (clientX) => {
    if (!L) return liveCursor();
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
    const key = `${getPlace().tz}:${night ? `m:${moon.phase.toFixed(3)}` : "sun"}`;
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
    const now = clockMs;
    const nowInRange = now >= rangeStart && now <= rangeEnd;
    nowLine.style.opacity = nowInRange ? "1" : "0";
    if (nowInRange) nowLine.style.left = `${L.x(now)}px`;
    if (!sample) return;
    const px = L.x(Math.min(rangeEnd, Math.max(rangeStart, timeMs)));
    const py = L.y(sample.height);
    const exploring = scrubbing || Boolean(anim) || Math.abs(timeMs - liveCursor()) > 8000;
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
    floatPlayhead();
  };

  const emit = () => {
    listeners.onView(viewTime, sampleTide(series, viewTime), scrubbing || Boolean(anim), {
      dayOffset,
    });
    paintChips();
    placeMarks(viewTime);
  };

  const easeToLive = () => {
    const from = viewTime;
    const t0 = performance.now();
    const dur = 1100;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      viewTime = from + (liveCursor() - from) * e;
      if (u < 1 && !scrubbing) {
        anim = requestAnimationFrame(step);
      } else {
        anim = null;
        viewTime = liveCursor();
      }
      emit();
    };
    if (anim) cancelAnimationFrame(anim);
    anim = requestAnimationFrame(step);
  };

  const onPointerDown = (event) => {
    if (!series.length) return;
    if (event.target?.closest?.(".day-flip")) return;
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
    idleTimer = window.setTimeout(easeToLive, 2000);
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
  window.addEventListener("livetide-mood", () => {
    chipKey = "";
    paint();
    placeMarks(viewTime);
  });

  const applyRange = (origin) => {
    const liveStart = startOfZonedDay(origin);
    const viewDay = addZonedDays(liveStart, dayOffset);
    const viewEnd = startOfNextZonedDay(viewDay);
    const inDay = pointsInDay(series, viewDay.getTime(), viewEnd.getTime());
    const lastT = series.length ? series[series.length - 1].t : 0;
    let stale = false;
    if (inDay.length >= 2) {
      rangeStart = viewDay.getTime();
      rangeEnd = viewEnd.getTime();
      stale = dayOffset === 0 && lastT < origin.getTime() - 90 * 60000;
    } else if (dayOffset === 0 && series.length >= 2) {
      const fallback = new Date(lastT);
      rangeStart = startOfZonedDay(fallback).getTime();
      rangeEnd = startOfNextZonedDay(fallback).getTime();
      stale = true;
    } else {
      rangeStart = viewDay.getTime();
      rangeEnd = viewEnd.getTime();
      stale = true;
    }
    return { stale, lastT, empty: inDay.length < 2 && series.length < 2 };
  };

  const paintStill = () => {
    holdBreath();
    paint();
    floatPlayhead();
  };

  const onBreathFrame = (now) => {
    breathFrame = requestAnimationFrame(onBreathFrame);
    if (document.hidden || motionReduced()) return;
    if (!lastBreathMs) {
      lastBreathMs = now;
      return;
    }
    const dt = now - lastBreathMs;
    if (dt < 33) return;
    lastBreathMs = now;
    advanceBreath(Math.min(dt, 80));
    if (series.length > 1) {
      paint();
      floatPlayhead();
    }
  };

  const stopBreath = () => {
    if (breathFrame) cancelAnimationFrame(breathFrame);
    breathFrame = 0;
    lastBreathMs = 0;
  };

  const startBreath = () => {
    if (motionReduced()) {
      stopBreath();
      if (series.length > 1) paintStill();
      return;
    }
    if (breathFrame) return;
    lastBreathMs = 0;
    breathFrame = requestAnimationFrame(onBreathFrame);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopBreath();
      return;
    }
    startBreath();
  });
  reduceMotion.addEventListener("change", startBreath);
  startBreath();

  return {
    setData({ series: nextSeries, extrema: nextExtrema, now }) {
      series = nextSeries ?? [];
      extrema = nextExtrema ?? [];
      const origin = now ?? new Date();
      originMs = origin.getTime();
      clockMs = originMs;
      const view = applyRange(origin);
      if (!scrubbing && !anim) {
        viewTime = view.stale && view.lastT && dayOffset === 0
          ? Math.min(origin.getTime(), Math.max(rangeStart, view.lastT))
          : liveCursor(origin);
      }
      chipKey = "";
      paint();
      emit();
      return view;
    },
    setDayOffset(nextOffset) {
      const next = nextOffset ? 1 : 0;
      if (next === dayOffset) return { dayOffset };
      dayOffset = next;
      if (anim) cancelAnimationFrame(anim);
      anim = null;
      scrubbing = false;
      clearTimeout(idleTimer);
      applyRange(new Date(originMs));
      viewTime = liveCursor();
      chipKey = "";
      paint();
      emit();
      return { dayOffset };
    },
    dayOffset() {
      return dayOffset;
    },
    hasDay(offset) {
      const origin = new Date(originMs);
      const start = addZonedDays(startOfZonedDay(origin), offset).getTime();
      const end = addZonedDays(startOfZonedDay(origin), offset + 1).getTime();
      const pts = series.filter((p) => p.t >= start - 3600000 && p.t <= end + 3600000);
      if (pts.length < 8) return false;
      return pts[0].t <= start + 4 * 3600000 && pts[pts.length - 1].t >= end - 4 * 3600000;
    },
    tick(now) {
      clockMs = (now ?? new Date()).getTime();
      if (!scrubbing && !anim) viewTime = liveCursor(now ?? new Date(clockMs));
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
