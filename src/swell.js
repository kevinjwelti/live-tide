import { skyPalette, solarPosition, LJ_LAT, LJ_LON } from "./time.js";
import coastUrl from "./assets/coast.jpg";

const LAYERS = [
  { y: 0.56, amp: 0.016, len: 0.28, speed: 0.12, phase: 0.2, alpha: 0.22 },
  { y: 0.66, amp: 0.024, len: 0.42, speed: 0.08, phase: 1.4, alpha: 0.28 },
  { y: 0.78, amp: 0.032, len: 0.62, speed: 0.05, phase: 2.1, alpha: 0.32 },
];

function waveY(x, t, layer, w, h) {
  const base = layer.y * h;
  const amp = layer.amp * h;
  const k = (Math.PI * 2) / (layer.len * w);
  return (
    base +
    Math.sin(x * k + t * layer.speed + layer.phase) * amp +
    Math.sin(x * k * 2.15 + t * layer.speed * 1.35 + 1.7) * amp * 0.28
  );
}

function sunScreenPos(date, w, h) {
  const { elevation: el, azimuth: az } = solarPosition(date, LJ_LAT, LJ_LON);
  const facing = 258;
  const rel = ((az - facing + 540) % 360) - 180;
  const x = w * (0.5 + (rel / 90) * 0.42);
  const horizon = h * 0.48;
  const y = horizon - (el / 70) * h * 0.4;
  return { x, y, el, az };
}

function drawCover(ctx, img, w, h) {
  const ir = img.width / img.height;
  const cr = w / h;
  let dw;
  let dh;
  let dx;
  let dy;
  if (ir > cr) {
    dh = h;
    dw = h * ir;
    dx = (w - dw) / 2;
    dy = 0;
  } else {
    dw = w;
    dh = w / ir;
    dx = 0;
    dy = (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function cloneCanvas(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d").drawImage(src, 0, 0);
  return c;
}

/**
 * Punch only the sunset SKY. Horizon water stays in the plate so it can be
 * recast; punching it was leaving a blue-sky / orange-sea seam.
 */
function knockOutSky(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const data = x.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  const h = c.height;
  const w = c.width;
  for (let y = 0; y < h; y += 1) {
    const fy = y / h;
    for (let col = 0; col < w; col += 1) {
      const i = (y * w + col) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 58) continue;
      const warm = r - b;
      const peach = lum > 118 && r > 145 && g > 100 && b < r - 4;
      const orange = r > 110 && warm > 18 && r >= g - 8;
      const haze = fy < 0.46 && lum > 135 && warm > 0 && r > 130;
      let sky = 0;
      if (fy < 0.47 && (orange || peach || haze)) {
        sky = orange || peach ? 1 : 0.9;
      } else if (fy < 0.44 && lum > 100 && warm > 8) {
        sky = 0.8;
      }
      if (fy > 0.42) sky *= Math.max(0, 1 - (fy - 0.42) / 0.07);
      if (sky > 0.04) d[i + 3] = Math.round(d[i + 3] * (1 - sky));
    }
  }
  x.putImageData(data, 0, 0);
  return c;
}

/**
 * Rebuild water/sand/land from luminance only. Hue is discarded so baked
 * sunset gold cannot leak. Bright orange glints flatten into teal water.
 */
function recastDaylight(src) {
  const c = cloneCanvas(src);
  const x = c.getContext("2d", { willReadFrequently: true });
  const data = x.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  const w = c.width;
  const h = c.height;
  for (let y = 0; y < h; y += 1) {
    const fy = y / h;
    const depth = Math.min(1, Math.max(0, (fy - 0.46) / 0.38));
    for (let col = 0; col < w; col += 1) {
      const i = (y * w + col) * 4;
      if (d[i + 3] < 10) continue;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const warm = r - b;
      const fx = col / w;
      const landBias = fx > 0.62 ? 26 : fx > 0.5 ? 10 : 0;
      const isLand = lum < 56 + landBias && warm < 42;

      if (isLand) {
        const k = lum / 255;
        d[i] = 8 + k * 42;
        d[i + 1] = 14 + k * 52;
        d[i + 2] = 22 + k * 58;
        continue;
      }

      // Kill sun-glint: warm highlights collapse toward mean water.
      const crushed =
        warm > 28 && lum > 70 ? 52 + (lum - 70) * 0.28 : 40 + lum * 0.5;

      if (fy > 0.8) {
        d[i] = 62 + crushed * 0.5;
        d[i + 1] = 78 + crushed * 0.45;
        d[i + 2] = 86 + crushed * 0.4;
      } else {
        d[i] = 20 + crushed * 0.28 + (1 - depth) * 14;
        d[i + 1] = 96 + crushed * 0.4 - depth * 14;
        d[i + 2] = 124 + crushed * 0.42 - depth * 8;
      }
    }
  }
  x.putImageData(data, 0, 0);
  return c;
}

function paintLiveSky(ctx, w, h, light) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, light.zenith);
  g.addColorStop(0.42, light.horizon);
  g.addColorStop(0.62, light.water);
  g.addColorStop(1, light.waterDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Cool teal sea + wet sand so punched holes never show the sunset JPEG. */
function paintDaySeascape(ctx, w, h, light) {
  const y0 = h * 0.44;
  const g = ctx.createLinearGradient(0, y0, 0, h);
  g.addColorStop(0, light.water);
  g.addColorStop(0.42, light.water);
  g.addColorStop(0.72, light.waterDeep);
  g.addColorStop(0.88, "rgb(70, 98, 108)");
  g.addColorStop(1, "rgb(86, 104, 110)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, w, h - y0);
}

export function createSwell(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let running = true;
  let start = performance.now();
  let palette = skyPalette(new Date());
  const plate = new Image();
  plate.src = coastUrl;
  let landWarm = null;
  let landDay = null;

  const resize = () => {
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const ensureLand = () => {
    if (landDay || !plate.complete || !plate.naturalWidth) return;
    landWarm = knockOutSky(plate);
    landDay = recastDaylight(landWarm);
  };

  const draw = () => {
    if (!running) return;
    const t = (performance.now() - start) / 1000;
    const date = new Date();
    palette = skyPalette(date);
    document.documentElement.style.setProperty("--type", palette.type);
    document.documentElement.style.setProperty("--cream", palette.type);

    const w = window.innerWidth;
    const h = window.innerHeight;
    ensureLand();

    paintLiveSky(ctx, w, h, palette);

    const warm = palette.warm;
    const cool = palette.cool;
    // Original sunset JPEG only when the real Scripps sun is near the horizon.
    const showSunsetPlate = warm > 0.35 && cool < 0.4;

    if (cool > 0.25) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, cool * 1.05);
      paintDaySeascape(ctx, w, h, palette);
      ctx.restore();
    }

    if (showSunsetPlate && landWarm) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (warm - 0.35) / 0.5);
      drawCover(ctx, landWarm, w, h);
      ctx.restore();
    } else if (landDay) {
      ctx.save();
      ctx.globalAlpha = palette.night > 0.2 ? 1 - 0.28 * palette.night : 1;
      drawCover(ctx, landDay, w, h);
      ctx.restore();
    }

    if (palette.night > 0.08) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.62 * palette.night;
      ctx.fillStyle = "rgb(8, 14, 32)";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    const sun = sunScreenPos(date, w, h);
    if (palette.sunInFrame > 0.08 && sun.el > -6 && showSunsetPlate) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 6, sun.x, sun.y, h * 0.38);
      glow.addColorStop(0, palette.sun);
      glow.addColorStop(0.22, palette.horizon);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = warm;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      ctx.beginPath();
      ctx.fillStyle = palette.sun;
      ctx.globalAlpha = 0.4 + 0.5 * palette.sunInFrame * warm;
      ctx.arc(sun.x, sun.y, Math.max(7, 12 + sun.el * 0.1), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (palette.night > 0.55) {
      const mx = w * 0.72;
      const my = h * 0.16;
      const moon = ctx.createRadialGradient(mx, my, 2, mx, my, 70);
      moon.addColorStop(0, "rgba(230,236,245,0.45)");
      moon.addColorStop(1, "rgba(230,236,245,0)");
      ctx.fillStyle = moon;
      ctx.fillRect(mx - 70, my - 70, 140, 140);
    }

    for (const layer of LAYERS) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      const step = Math.max(10, Math.round(w / 80));
      for (let x = 0; x <= w; x += step) {
        ctx.lineTo(x, waveY(x, t, layer, w, h));
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.save();
      ctx.globalCompositeOperation = cool > 0.35 ? "source-over" : "soft-light";
      ctx.globalAlpha = layer.alpha * (cool > 0.35 ? 0.4 : 1);
      ctx.fillStyle = palette.water;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = palette.foam;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", resize);
  plate.addEventListener("load", () => {
    landWarm = null;
    landDay = null;
    ensureLand();
  });
  document.addEventListener("visibilitychange", () => {
    running = document.visibilityState !== "hidden";
    if (running) {
      start = performance.now();
      requestAnimationFrame(draw);
    }
  });
  requestAnimationFrame(draw);

  return {
    palette: () => palette,
  };
}
