import { skyPalette, solarPosition, LJ_LAT, LJ_LON } from "./time.js";
import coastUrl from "./assets/coast.jpg";

const LAYERS = [
  { y: 0.58, amp: 0.014, len: 0.28, speed: 0.12, phase: 0.2, alpha: 0.16 },
  { y: 0.68, amp: 0.022, len: 0.42, speed: 0.08, phase: 1.4, alpha: 0.2 },
  { y: 0.8, amp: 0.03, len: 0.62, speed: 0.05, phase: 2.1, alpha: 0.24 },
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

/** Punch sunset sky to alpha so a live sky can show through. Keep dark palms/rocks. */
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
      const haze = fy < 0.52 && lum > 135 && warm > 0 && r > 130;
      let sky = 0;
      if (fy < 0.6 && (orange || peach || haze)) {
        sky = orange || peach ? 1 : 0.85;
      } else if (fy < 0.48 && lum > 100 && warm > 8) {
        sky = 0.75;
      }
      if (fy > 0.5) sky *= Math.max(0, 1 - (fy - 0.5) / 0.14);
      if (sky > 0.04) d[i + 3] = Math.round(d[i + 3] * (1 - sky));
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

export function createSwell(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let running = true;
  let start = performance.now();
  let palette = skyPalette(new Date());
  const plate = new Image();
  plate.src = coastUrl;
  let land = null;

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
    if (land || !plate.complete || !plate.naturalWidth) return;
    land = knockOutSky(plate);
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

    if (palette.warm > 0.04 && plate.complete && plate.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = palette.warm * 0.92;
      drawCover(ctx, plate, w, h);
      ctx.restore();
    }

    if (land) {
      ctx.save();
      if (palette.night > 0.2) ctx.globalAlpha = 1 - 0.35 * palette.night;
      drawCover(ctx, land, w, h);
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
    if (palette.sunInFrame > 0.08 && sun.el > -6 && palette.warm > 0.15) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 6, sun.x, sun.y, h * 0.38);
      glow.addColorStop(0, palette.sun);
      glow.addColorStop(0.22, palette.horizon);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = palette.warm;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      ctx.beginPath();
      ctx.fillStyle = palette.sun;
      ctx.globalAlpha = 0.4 + 0.5 * palette.sunInFrame * palette.warm;
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
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = layer.alpha;
      ctx.fillStyle = palette.water;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.14;
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
    land = null;
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
