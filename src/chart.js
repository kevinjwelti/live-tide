import {
  formatClock,
  startOfZonedDay,
  startOfNextZonedDay,
  skyPalette,
  isNightScene,
  getPlace,
} from "./time.js";
import { sampleTide } from "./tide.js";
import { moonState, renderMoon, renderSun } from "./moon.js";
import { canvasStyle } from "./moods.js";
import { breathLight, breathPeriodMs, breathSwell, tideBreathLevel } from "./breath.js";
import { washDropPx, washState } from "./wash.js";
import { getSkyMode } from "./now.js";
import { washWeights } from "./swell.js";
import { shoreBreathReach, shoreNightFade, shoreWetStep } from "./shore.js";
import { createShorePhoto } from "./shore-photo.js";
import { createTropicPhoto } from "./tropic-photo.js";

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

/** Mood tint for the water. A hard ink stroke is not used. */
function moodColor(style, night) {
  const inner = night ? style.inner?.night : style.inner?.day;
  if (rgbOf(inner)) return inner;
  if (style.twin) return night ? style.twin.b.color : style.twin.a.color;
  return night ? "rgba(214, 226, 240, 0.9)" : "rgba(255, 236, 214, 0.9)";
}

function closeWater(ctx, series, L, from, to, yShift) {
  curvePath(ctx, series, L, from, to, yShift);
  const lastX = L.x(Math.min(to, series[series.length - 1].t));
  ctx.lineTo(lastX, L.bottom + 2);
  ctx.lineTo(L.x(from), L.bottom + 2);
  ctx.closePath();
}

export function createChart(stage) {
  const canvas = stage.querySelector("#chart");
  const ctx = canvas.getContext("2d");
  const bleed = document.querySelector("#shore-bleed");
  const bleedCtx = bleed?.getContext("2d");
  const shoreBuffer = document.createElement("canvas");
  const shoreCtx = shoreBuffer.getContext("2d");
  const playhead = stage.querySelector("#playhead");
  const orb = playhead?.querySelector("#playhead-orb");
  const labelsEl = stage.querySelector("#extremum-labels");
  const hit = stage.querySelector("#chart-hit") ?? stage;

  let series = [];
  let extrema = [];
  let L = null;
  let rangeStart = 0;
  let rangeEnd = 1;
  let viewTime = Date.now();
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
  let washMs = 0;
  let shoreWet = 0.35;
  let swellPx = 0;
  let breathGlow = 0.7;
  let causticShift = 0;
  let tideLevel = 0.5;
  let tideRising = true;
  let lastBreathMs = 0;
  let breathFrame = 0;
  let shown = true;
  let forecastStart = null;
  let dotLive = true;
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
    washMs += dt;
  };

  const holdBreath = () => {
    syncTide();
    swellPx = 0;
    causticShift = 0;
    breathGlow = breathLight(Math.PI / 2, tideRising);
  };

  const liveCursor = (now = new Date()) => now.getTime();

  const fitCanvas = (node, g, width, height) => {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const bw = Math.max(2, Math.round(width * dpr));
    const bh = Math.max(2, Math.round(height * dpr));
    if (node.width !== bw || node.height !== bh) {
      node.width = bw;
      node.height = bh;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
  };

  const sceneSize = () => {
    const scene = bleed?.parentElement;
    if (!scene) return null;
    return { w: scene.clientWidth, h: scene.clientHeight };
  };

  const paint = () => {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    const scene = sceneSize();
    if (bleed && bleedCtx && scene) fitCanvas(bleed, bleedCtx, scene.w, scene.h);
    if (series.length < 2) {
      labelsEl?.replaceChildren();
      return;
    }
    L = layout(w, h, series, rangeStart, rangeEnd);
    const cover = beachCover();
    const tropic = tropicCover();
    if (tropic > 0.004 && bleedCtx && scene) {
      bleedCtx.save();
      bleedCtx.globalAlpha = tropic >= 0.996 ? 1 : tropic;
      const painted = paintTropic(bleedCtx, scene.w, scene.h, false, false);
      bleedCtx.restore();
      if (!painted) paintLiving();
      else if (tropic >= 0.996) paintTropicCurve(ctx);
      else paintLiving();
    } else if (tropic > 0.004) {
      if (tropic >= 0.996) {
        paintTropic(ctx, w, h);
      } else {
        paintLiving();
        paintTropic(shoreCtx, w, h, true);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = tropic;
        ctx.drawImage(shoreBuffer, 0, 0);
        ctx.restore();
      }
    } else if (cover <= 0.004) {
      paintLiving();
      paintNightReach();
    } else if (cover >= 0.996) {
      paintShore(ctx, w, h);
    } else {
      paintLiving();
      paintShore(shoreCtx, w, h, true);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = cover;
      ctx.drawImage(shoreBuffer, 0, 0);
      ctx.restore();
    }
    paintChips();
  };

  const nightReachesEdges = () => (
    document.documentElement.dataset.shore === "tropic"
    && document.documentElement.dataset.light === "night"
    && tropicCover() < 0.05
  );

  const paintNightReach = () => {
    if (!bleed || !bleedCtx || !L || !nightReachesEdges()) return;
    const scene = bleed.parentElement;
    if (!scene) return;
    const sw = scene.clientWidth;
    const sh = scene.clientHeight;
    const stageBox = stage.getBoundingClientRect();
    const sceneBox = scene.getBoundingClientRect();
    const ox = stageBox.left - sceneBox.left;
    const oy = stageBox.top - sceneBox.top;
    const steps = 64;
    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = rangeStart + ((rangeEnd - rangeStart) * i) / steps;
      const sample = sampleTide(series, t);
      if (!sample) continue;
      pts.push({ x: L.x(t), y: L.y(sample.height) - swellPx });
    }
    if (pts.length < 2) return;
    const tint = moodColor(canvasStyle(), true);
    const surface = 0.2 + breathGlow * 0.08;
    const deep = 0.04 + breathGlow * 0.03;
    const floor = sh - oy;
    bleedCtx.save();
    bleedCtx.translate(ox, oy);
    bleedCtx.beginPath();
    bleedCtx.moveTo(-ox, pts[0].y);
    pts.forEach((p) => bleedCtx.lineTo(p.x, p.y));
    bleedCtx.lineTo(sw - ox, pts[pts.length - 1].y);
    bleedCtx.lineTo(sw - ox, floor);
    bleedCtx.lineTo(-ox, floor);
    bleedCtx.closePath();
    const body = bleedCtx.createLinearGradient(0, L.top, 0, Math.max(L.bottom + 2, floor));
    body.addColorStop(0, withAlpha(tint, surface));
    body.addColorStop(0.42, withAlpha(tint, deep));
    body.addColorStop(0.72, withAlpha(tint, deep * 0.35));
    body.addColorStop(1, withAlpha(tint, 0));
    bleedCtx.fillStyle = body;
    bleedCtx.fill();
    bleedCtx.restore();
  };

  const paintLiving = () => {
    const style = canvasStyle();
    const night = document.documentElement.dataset.light === "night";
    const shift = swellPx;
    paintHaze(shift, night);
    if (!nightReachesEdges()) paintWater(shift, style, night);
    paintCaustics();
    paintWashes(shift, style, night);
    paintSoftEdge(shift, style, night);
    paintShimmer(shift);
  };

  const beachCover = () => {
    if (document.documentElement.dataset.shore !== "real") return 0;
    const mode = getSkyMode();
    if (mode === "night") return 0;
    if (mode === "noon" || mode === "dusk") return 1;
    return shoreNightFade(skyPalette(new Date(clockMs)).night);
  };

  const tropicCover = () => {
    if (document.documentElement.dataset.shore !== "tropic") return 0;
    const mode = getSkyMode();
    if (mode === "night") return 0;
    if (mode === "noon" || mode === "dusk") return 1;
    return shoreNightFade(skyPalette(new Date(clockMs)).night);
  };

  const tropicGold = () => {
    const mode = getSkyMode();
    if (mode === "night") return 0;
    const light = skyPalette(new Date(clockMs));
    const pinnedDusk = mode === "dusk";
    if (!pinnedDusk && isNightScene(light)) return 0;
    const weights = pinnedDusk ? { earth: 1 } : washWeights(light.elevation);
    return weights.earth;
  };

  const tropicHorizon = () => {
    const value = new URLSearchParams(location.search).get("horizon");
    if (value === "sea" || value === "surf") return value;
    return "haze";
  };

  const shoreScene = () => {
    if (getSkyMode() === "dusk" || document.documentElement.dataset.light === "gold") return "dusk";
    return "day";
  };

  const shoreLine = () => {
    const steps = 140;
    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      const t = rangeStart + (rangeEnd - rangeStart) * u;
      const sample = sampleTide(series, t);
      if (!sample) continue;
      pts.push({ x: L.x(t), y: L.y(sample.height), u });
    }
    return pts;
  };

  const shorePhoto = createShorePhoto();
  const tropicPhoto = createTropicPhoto();

  const paintTropicCurve = (g) => {
    if (!L) return;
    const span = Math.max(1, L.right - L.left);
    const core = Math.min(3.2, Math.max(2.2, span / 520));
    g.save();
    g.lineJoin = "round";
    g.lineCap = "round";
    curvePath(g, series, L, rangeStart, rangeEnd, 0);
    g.strokeStyle = "rgba(8, 16, 22, 0.78)";
    g.lineWidth = core + 5.5;
    g.stroke();
    curvePath(g, series, L, rangeStart, rangeEnd, 0);
    g.strokeStyle = "rgba(255, 250, 242, 0.97)";
    g.lineWidth = core;
    g.stroke();
    g.restore();
  };

  const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rgba = (c, a) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;

  const paintTropicSea = (g, w, y, frameH, gold, surf, phase) => {
    // About 5% of the frame: a distant ocean you can actually see.
    const bandH = Math.max(40, frameH * 0.05);
    const top = y;
    // Noon is sapphire. Dusk keeps a navy body and only warms the far edge to peach.
    const edge = mixRgb([14, 74, 158], [196, 124, 122], gold);
    const far = mixRgb([4, 28, 114], [34, 44, 112], gold);
    const near = mixRgb([10, 62, 142], [86, 74, 124], gold);

    const mistH = Math.max(36, frameH * 0.055);
    const mistTop = top - mistH * 0.78;
    const mistColor = mixRgb([176, 206, 226], [236, 184, 166], gold);
    const mist = g.createLinearGradient(0, mistTop, 0, top + bandH * 0.2);
    mist.addColorStop(0, rgba(mistColor, 0));
    mist.addColorStop(0.62, rgba(mistColor, 0.2));
    mist.addColorStop(1, rgba(mistColor, 0));
    g.fillStyle = mist;
    g.fillRect(0, mistTop, w, mistH);

    const sea = g.createLinearGradient(0, top - 4, 0, top + bandH);
    sea.addColorStop(0, rgba(edge, 0));
    sea.addColorStop(0.06, rgba(edge, 0.72));
    sea.addColorStop(0.16, rgba(far, 0.96));
    sea.addColorStop(0.58, rgba(far, 0.94));
    sea.addColorStop(0.82, rgba(near, 0.5));
    sea.addColorStop(1, rgba(near, 0));
    g.fillStyle = sea;
    g.fillRect(0, top - 6, w, bandH + 8);

    if (!surf) return;
    const foam = mixRgb([255, 255, 252], [255, 214, 176], gold);
    const spark = mixRgb([255, 252, 238], [255, 178, 64], gold);
    const foamY = top + bandH * 0.36;
    const drift = Math.sin(phase * 0.4) * 16;
    g.save();
    g.lineCap = "round";
    const washTop = foamY - bandH * 0.12;
    const wash = g.createLinearGradient(0, washTop, 0, washTop + bandH * 0.28);
    wash.addColorStop(0, rgba(foam, 0));
    wash.addColorStop(0.42, rgba(foam, 0.72));
    wash.addColorStop(1, rgba(foam, 0));
    g.fillStyle = wash;
    g.fillRect(0, washTop, w, bandH * 0.3);

    for (let i = 0; i < 46; i += 1) {
      const frac = Math.abs(Math.sin(i * 12.9898));
      const x = ((i * 67.4 + frac * 48 + drift) % (w + 36)) - 18;
      const gy = foamY + Math.sin(i * 2.15 + phase * 0.55) * 2.6;
      const len = 10 + frac * 34;
      g.strokeStyle = rgba(foam, 0.5 + frac * 0.45);
      g.lineWidth = 1.7 + (1 - frac) * 2.6;
      g.beginPath();
      g.moveTo(x, gy);
      g.quadraticCurveTo(x + len * 0.45, gy - 2.2, x + len, gy + Math.sin(i * 1.4) * 1.4);
      g.stroke();
    }

    for (let i = 0; i < 36; i += 1) {
      const pulse = Math.sin(phase * 2.15 + i * 1.87);
      const tw = pulse > 0 ? Math.pow(pulse, 1.35) : 0;
      const x = ((i * 109.5 + phase * 22) % (w + 24)) - 12;
      const gy = foamY + Math.sin(i * 1.63 + phase * 0.5) * bandH * 0.1;
      const bright = 0.34 + tw * 0.66;
      g.fillStyle = rgba(spark, bright);
      g.beginPath();
      g.arc(x, gy, 1.5 + tw * 2.4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = rgba(spark, 0.25 + tw * 0.75);
      g.lineWidth = 1.35;
      g.beginPath();
      g.moveTo(x - 4 - tw * 5, gy);
      g.lineTo(x + 4 + tw * 7, gy);
      g.stroke();
    }
    g.restore();
  };

  const paintTropic = (g, w, h, buffered, withCurve = true) => {
    if (buffered) {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      if (shoreBuffer.width !== canvas.width || shoreBuffer.height !== canvas.height) {
        shoreBuffer.width = canvas.width;
        shoreBuffer.height = canvas.height;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
    }
    const reduced = motionReduced();
    const frame = tropicPhoto.frame({
      w,
      h,
      phase: reduced ? 1.2 : breathPhase,
      gold: tropicGold(),
    });
    if (!frame) {
      if (!buffered && g === ctx) paintLiving();
      return false;
    }
    g.save();
    g.drawImage(frame, 0, 0, w, h);
    g.globalCompositeOperation = "destination-in";
    const frameEl = stage.closest(".frame");
    const frameBox = frameEl ? frameEl.getBoundingClientRect() : { top: 0, height: window.innerHeight };
    const hostTop = g.canvas?.getBoundingClientRect?.().top ?? stage.getBoundingClientRect().top;
    const frameH = Math.max(1, frameBox.height);
    // Water and sand stay at or below the middle of the frame. The ramp
    // starts there (or at the chart top, if the chart itself is lower)
    // and dissolves downward so the edge is not a hard box.
    const midpoint = frameBox.top + frameH * 0.5 - hostTop;
    const horizon = tropicHorizon();
    const feather = horizon === "haze" ? Math.max(220, frameH * 0.36) : Math.max(128, frameH * 0.2);
    const start = Math.max(0, midpoint);
    const veil = g.createLinearGradient(0, start, 0, start + feather);
    if (horizon === "haze") {
      veil.addColorStop(0, "rgba(0,0,0,0)");
      veil.addColorStop(0.2, "rgba(0,0,0,0.05)");
      veil.addColorStop(0.46, "rgba(0,0,0,0.18)");
      veil.addColorStop(0.7, "rgba(0,0,0,0.46)");
      veil.addColorStop(0.88, "rgba(0,0,0,0.78)");
      veil.addColorStop(1, "rgba(0,0,0,1)");
    } else {
      veil.addColorStop(0, "rgba(0,0,0,0)");
      veil.addColorStop(0.42, "rgba(0,0,0,0.14)");
      veil.addColorStop(0.72, "rgba(0,0,0,0.62)");
      veil.addColorStop(1, "rgba(0,0,0,1)");
    }
    g.fillStyle = veil;
    g.fillRect(0, 0, w, h);
    g.restore();
    if (horizon === "sea" || horizon === "surf") {
      paintTropicSea(g, w, start, frameH, tropicGold(), horizon === "surf", reduced ? 1.2 : breathPhase);
    }
    if (withCurve) paintTropicCurve(g);
    return true;
  };

  const paintShore = (g, w, h, buffered) => {
    if (buffered) {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      if (shoreBuffer.width !== canvas.width || shoreBuffer.height !== canvas.height) {
        shoreBuffer.width = canvas.width;
        shoreBuffer.height = canvas.height;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
    }
    const pts = shoreLine();
    if (pts.length < 2) return;
    const reduced = motionReduced();
    const phase = reduced ? 0 : breathPhase;
    const reach = shoreBreathReach(phase);
    if (!reduced) shoreWet = shoreWetStep(shoreWet, reach);
    const frame = shorePhoto.frame({
      w,
      h,
      pts,
      reach: reduced ? 0.5 : shoreBreathReach(phase),
      wet: reduced ? 0.45 : shoreWet,
      dusk: shoreScene() === "dusk" ? 1 : 0,
    });
    if (!frame) return;
    g.save();
    g.drawImage(frame, 0, 0, w, h);
    g.globalCompositeOperation = "destination-in";
    const veil = g.createLinearGradient(0, 0, 0, Math.max(72, h * 0.16));
    veil.addColorStop(0, "rgba(0,0,0,0)");
    veil.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = veil;
    g.fillRect(0, 0, w, h);
    g.restore();
  };

  const paintHaze = (shift, night) => {
    const warm = night ? "255, 206, 160" : "255, 186, 120";
    const alpha = (night ? 0.035 : 0.05) + breathGlow * (night ? 0.03 : 0.045);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    curvePath(ctx, series, L, rangeStart, rangeEnd, shift);
    ctx.strokeStyle = `rgba(${warm}, ${alpha})`;
    ctx.lineWidth = 36 + breathGlow * 8;
    ctx.stroke();
    ctx.restore();
  };

  const paintWater = (shift, style, night) => {
    const tint = moodColor(style, night);
    const surface = 0.2 + breathGlow * 0.08;
    const deep = night ? 0.04 : 0.055;
    ctx.save();
    closeWater(ctx, series, L, rangeStart, rangeEnd, shift);
    const body = ctx.createLinearGradient(0, L.top, 0, L.bottom + 2);
    body.addColorStop(0, withAlpha(tint, surface));
    body.addColorStop(0.55, withAlpha(tint, deep + breathGlow * 0.03));
    body.addColorStop(1, withAlpha(tint, 0));
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();
  };

  const paintWashes = (shift, _style, night) => {
    if (!L) return;
    const steps = 48;
    const samples = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = rangeStart + ((rangeEnd - rangeStart) * i) / steps;
      const sample = sampleTide(series, t);
      if (!sample) continue;
      samples.push({ x: L.x(t), y: L.y(sample.height) - shift });
    }
    if (samples.length < 2) return;

    const reduced = motionReduced();
    const state = reduced ? { reach: 0, foam: 0, wet: 0.65, phase: "rest" } : washState(washMs);
    const cream = night ? "214, 226, 238" : "255, 250, 242";
    const quiet = night ? 0.72 : 1;
    const floor = L.bottom + 2;
    const lacePhase = washMs * 0.00035;

    const yAt = (index, extra) => {
      const s = samples[index];
      return Math.min(floor, s.y + extra);
    };

    ctx.save();
    closeWater(ctx, series, L, rangeStart, rangeEnd, shift);
    ctx.clip();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const wetAlpha = (0.045 + state.wet * 0.035) * quiet;
    ctx.beginPath();
    ctx.moveTo(samples[0].x, yAt(0, 3));
    for (let i = 1; i < samples.length; i += 1) ctx.lineTo(samples[i].x, yAt(i, 3));
    for (let i = samples.length - 1; i >= 0; i -= 1) ctx.lineTo(samples[i].x, yAt(i, 26));
    ctx.closePath();
    ctx.fillStyle = `rgba(${night ? "8, 16, 28" : "18, 42, 64"}, ${wetAlpha.toFixed(3)})`;
    ctx.fill();

    if (!reduced && state.reach > 0.02) {
      const frontExtra = (index) => {
        const drop = washDropPx(state.reach, floor - samples[index].y);
        return drop;
      };
      ctx.beginPath();
      ctx.moveTo(samples[0].x, yAt(0, frontExtra(0)));
      for (let i = 1; i < samples.length; i += 1) ctx.lineTo(samples[i].x, yAt(i, frontExtra(i)));
      for (let i = samples.length - 1; i >= 0; i -= 1) {
        ctx.lineTo(samples[i].x, yAt(i, frontExtra(i) + 150));
      }
      ctx.closePath();
      const mid = samples[Math.floor(samples.length / 2)];
      const midFront = mid.y + washDropPx(state.reach, floor - mid.y);
      const sheet = ctx.createLinearGradient(0, midFront, 0, midFront + 150);
      const alpha = (0.09 + state.reach * 0.06) * quiet;
      sheet.addColorStop(0, `rgba(${cream}, ${alpha.toFixed(3)})`);
      sheet.addColorStop(0.45, `rgba(${cream}, ${(alpha * 0.45).toFixed(3)})`);
      sheet.addColorStop(1, `rgba(${cream}, 0)`);
      ctx.fillStyle = sheet;
      ctx.fill();

      if (state.foam > 0.04) {
        const foamAlpha = (0.28 * state.foam * quiet).toFixed(3);
        ctx.beginPath();
        for (let i = 0; i < samples.length; i += 1) {
          const lace = 1.6
            + Math.abs(Math.sin(i * 0.62 + lacePhase) * 3.4)
            + Math.abs(Math.sin(i * 1.47 + 1.2) * 1.6);
          const y = yAt(i, frontExtra(i) + lace);
          if (i === 0) ctx.moveTo(samples[i].x, y);
          else ctx.lineTo(samples[i].x, y);
        }
        ctx.strokeStyle = `rgba(${cream}, ${(0.12 * state.foam * quiet).toFixed(3)})`;
        ctx.lineWidth = 4.5;
        ctx.stroke();
        ctx.strokeStyle = `rgba(${cream}, ${foamAlpha})`;
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const paintSoftEdge = (shift, style, night) => {
    const tint = moodColor(style, night);
    const dark = (() => {
      const rgb = rgbOf(tint);
      return rgb ? rgb[0] + rgb[1] + rgb[2] < 280 : false;
    })();
    const glow = dark ? (night ? "rgba(236, 226, 208, 0.9)" : "rgba(255, 244, 228, 0.95)") : tint;
    const span = Math.max(1, L.right - L.left);
    const core = Math.min(3, Math.max(2, span / 560));
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    curvePath(ctx, series, L, rangeStart, rangeEnd, shift);
    ctx.strokeStyle = withAlpha(glow, 0.2 + breathGlow * 0.08);
    ctx.lineWidth = core + 9;
    ctx.stroke();
    curvePath(ctx, series, L, rangeStart, rangeEnd, shift);
    ctx.strokeStyle = withAlpha(glow, night ? 0.94 : 0.9);
    ctx.lineWidth = core;
    ctx.stroke();
    ctx.restore();
  };

  const paintCaustics = () => {
    if (!L) return;
    const night = document.documentElement.dataset.light === "night";
    const ink = night ? "210, 224, 240" : "255, 248, 236";
    ctx.save();
    closeWater(ctx, series, L, rangeStart, rangeEnd, swellPx);
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
    closeWater(ctx, series, L, rangeStart, rangeEnd, shift);
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
    const follow = motionReduced() ? 0 : swellPx;
    playhead.style.transform = `translateY(${(-follow).toFixed(2)}px)`;
    playhead.style.setProperty("--breath", breathGlow.toFixed(3));
  };

  const paintChips = () => {
    if (!L || !labelsEl) return;
    const key = `${rangeStart}:${rangeEnd}:${Math.round(stage.clientWidth)}:${Math.round(stage.clientHeight)}`;
    if (key === chipKey && labelsEl.childNodes.length) return;
    chipKey = key;
    labelsEl.replaceChildren();
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const dayExtrema = extrema.filter((e) => e.t >= rangeStart && e.t <= rangeEnd);
    const cursor = sampleTide(series, viewTime);
    const orbPx = cursor
      ? L.x(Math.min(rangeEnd, Math.max(rangeStart, viewTime)))
      : null;
    const orbPy = cursor ? L.y(cursor.height) - swellPx : null;
    const placed = [];
    dayExtrema.forEach((e) => {
      const node = document.createElement("div");
      const low = e.type !== "H";
      node.className = "extremum";
      node.innerHTML = `<div class="t-time">${formatClock(new Date(e.t))}</div>
        <div class="t-ht">${e.v.toFixed(1)}<span class="t-unit"> ft</span></div>
        <div class="t-kind">${low ? "Low" : "High"}</div>`;
      labelsEl.append(node);
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      const px = L.x(e.t);
      const py = L.y(e.v);
      let above = !low;
      if (!above && py > h - height - 40) above = true;
      if (above && py < height + 28) above = false;
      const rectFor = (gap, nudge, isAbove) => {
        const left = px + nudge - width / 2;
        const top = isAbove ? py - gap - height : py + gap;
        return { left, top, right: left + width, bottom: top + height };
      };
      const hitsOrb = (rect) => {
        if (orbPx == null) return false;
        const cx = Math.min(Math.max(orbPx, rect.left), rect.right);
        const cy = Math.min(Math.max(orbPy, rect.top), rect.bottom);
        const dx = orbPx - cx;
        const dy = orbPy - cy;
        return dx * dx + dy * dy < 36 * 36;
      };
      const hitsPlaced = (rect) => placed.some(
        (other) => rect.right > other.left && rect.left < other.right && rect.bottom > other.top && rect.top < other.bottom
      );
      let gap = 28;
      let nudge = 0;
      let rect = rectFor(gap, nudge, above);
      if (hitsOrb(rect)) {
        gap = Math.max(gap, 84);
        rect = rectFor(gap, nudge, above);
      }
      if (above && py - gap - height < 8) {
        above = false;
        gap = 28;
        rect = rectFor(gap, nudge, above);
      }
      if (!above && py + gap + height > h - 8) {
        above = true;
        gap = 28;
        rect = rectFor(gap, nudge, above);
      }
      if (hitsOrb(rect) || hitsPlaced(rect)) {
        const toward = px < (orbPx ?? w / 2) ? -1 : 1;
        nudge = toward * Math.min(88, width * 0.55);
        rect = rectFor(gap, nudge, above);
      }
      const half = width / 2;
      const left = Math.min(w - half - 8, Math.max(half + 8, px + nudge));
      nudge = left - px;
      node.classList.toggle("is-low", !above);
      node.style.left = `${px}px`;
      node.style.top = `${py}px`;
      node.style.setProperty("--whisper-gap", `${gap}px`);
      node.style.setProperty("--whisper-x", `${nudge}px`);
      placed.push(rectFor(gap, nudge, above));
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
    if (!L || !series.length || !playhead) return;
    if (!dotLive) {
      playhead.style.opacity = "0";
      return;
    }
    const sample = sampleTide(series, timeMs);
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
    floatPlayhead();
  };

  const emit = () => {
    listeners.onView(viewTime, sampleTide(series, viewTime), scrubbing || Boolean(anim));
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
    if (event.target?.closest?.(".forecast-toggle")) return;
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
    if (forecastStart != null) {
      const viewDay = new Date(forecastStart);
      const viewEnd = startOfNextZonedDay(viewDay);
      rangeStart = viewDay.getTime();
      rangeEnd = viewEnd.getTime();
      const inDay = pointsInDay(series, rangeStart, rangeEnd);
      const lastT = series.length ? series[series.length - 1].t : 0;
      return { stale: false, lastT, empty: inDay.length < 2 };
    }
    const liveStart = startOfZonedDay(origin);
    const viewEnd = startOfNextZonedDay(liveStart);
    const inDay = pointsInDay(series, liveStart.getTime(), viewEnd.getTime());
    const lastT = series.length ? series[series.length - 1].t : 0;
    let stale = false;
    if (inDay.length >= 2) {
      rangeStart = liveStart.getTime();
      rangeEnd = viewEnd.getTime();
      stale = lastT < origin.getTime() - 90 * 60000;
    } else if (series.length >= 2) {
      const fallback = new Date(lastT);
      rangeStart = startOfZonedDay(fallback).getTime();
      rangeEnd = startOfNextZonedDay(fallback).getTime();
      stale = true;
    } else {
      rangeStart = liveStart.getTime();
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
    if (!shown) return;
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
        viewTime = view.stale && view.lastT
          ? Math.min(origin.getTime(), Math.max(rangeStart, view.lastT))
          : liveCursor(origin);
      }
      chipKey = "";
      paint();
      emit();
      return view;
    },
    setShown(on) {
      shown = Boolean(on);
      if (shown) {
        if (series.length > 1) {
          paint();
          emit();
        }
        startBreath();
      } else stopBreath();
    },
    showForecastDay(startMs, { live = false } = {}) {
      forecastStart = startMs;
      dotLive = Boolean(live);
      scrubbing = false;
      if (anim) cancelAnimationFrame(anim);
      anim = null;
      applyRange(new Date(originMs));
      viewTime = dotLive ? liveCursor(new Date()) : rangeStart;
      chipKey = "";
      if (shown) {
        paint();
        emit();
      }
    },
    clearForecastDay() {
      if (forecastStart == null && dotLive) return;
      forecastStart = null;
      dotLive = true;
      scrubbing = false;
      applyRange(new Date(originMs || Date.now()));
      viewTime = liveCursor(new Date());
      chipKey = "";
      if (playhead) playhead.style.opacity = "";
      if (shown) {
        paint();
        emit();
      }
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
