import { skyPalette, solarElevation, SD_LAT, SD_LON } from "./time.js";

const LAYERS = [
  { y: 0.58, amp: 0.012, len: 0.28, speed: 0.12, phase: 0.2, alpha: 0.1 },
  { y: 0.68, amp: 0.02, len: 0.42, speed: 0.08, phase: 1.4, alpha: 0.14 },
  { y: 0.8, amp: 0.028, len: 0.62, speed: 0.05, phase: 2.1, alpha: 0.18 },
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

function sunPos(date, w, h) {
  const el = solarElevation(date);
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + 36000.76983 * T) % 360;
  const M = (357.52911 + 35999.05029 * T) % 360;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M * rad) + 0.019993 * Math.sin(2 * M * rad);
  const lam = (L0 + C) * rad;
  const eps = (23.439291 - 0.0130042 * T) * rad;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (280.46061837 + 360.98564736629 * (jd - 2451545)) % 360;
  const lst = ((gmst + SD_LON) % 360) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const ha = lst - ra;
  const az = Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(SD_LAT * rad) - Math.tan(decl) * Math.cos(SD_LAT * rad)
  );
  const x = w * (0.5 + (az / Math.PI) * 0.42);
  const horizon = h * 0.48;
  const y = horizon - (el / 70) * h * 0.4;
  return { x, y, el };
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

export function createSwell(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let running = true;
  let start = performance.now();
  let palette = skyPalette(new Date());
  const plate = new Image();
  plate.src = `${import.meta.env.BASE_URL}coast.jpg`;

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

  const draw = (now) => {
    if (!running) return;
    const t = (now - start) / 1000;
    const date = new Date();
    palette = skyPalette(date);
    document.documentElement.style.setProperty("--type", palette.type);
    document.documentElement.style.setProperty("--cream", palette.type);

    const w = window.innerWidth;
    const h = window.innerHeight;

    if (plate.complete && plate.naturalWidth) {
      drawCover(ctx, plate, w, h);
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, palette.zenith);
      sky.addColorStop(0.62, palette.horizon);
      sky.addColorStop(1, palette.water);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
    }

    const el = palette.elevation;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    if (el < -6) {
      ctx.fillStyle = "rgb(18, 28, 48)";
      ctx.globalAlpha = 0.55;
    } else if (el < 8) {
      ctx.fillStyle = palette.horizon;
      ctx.globalAlpha = 0.16;
    } else if (el < 28) {
      ctx.fillStyle = palette.zenith;
      ctx.globalAlpha = 0.12;
    } else {
      ctx.fillStyle = palette.zenith;
      ctx.globalAlpha = 0.2;
    }
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const sun = sunPos(date, w, h);
    if (sun.el > -9) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 6, sun.x, sun.y, h * 0.38);
      glow.addColorStop(0, palette.sun);
      glow.addColorStop(0.18, "rgba(255, 186, 110, 0.18)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      ctx.beginPath();
      ctx.fillStyle = palette.sun;
      ctx.globalAlpha = 0.55;
      ctx.arc(sun.x, sun.y, Math.max(8, 14 + sun.el * 0.12), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      const mx = w * 0.72;
      const my = h * 0.16;
      const moon = ctx.createRadialGradient(mx, my, 2, mx, my, 70);
      moon.addColorStop(0, "rgba(230,236,245,0.55)");
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
    start = performance.now();
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
