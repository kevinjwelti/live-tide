import { skyPalette, solarElevation, SD_LAT, SD_LON } from "./time.js";

const LAYERS = [
  { y: 0.52, amp: 0.018, len: 0.22, speed: 0.18, phase: 0.2, alpha: 0.28 },
  { y: 0.58, amp: 0.028, len: 0.31, speed: 0.13, phase: 1.1, alpha: 0.34 },
  { y: 0.66, amp: 0.04, len: 0.42, speed: 0.09, phase: 2.4, alpha: 0.42 },
  { y: 0.76, amp: 0.055, len: 0.58, speed: 0.06, phase: 0.7, alpha: 0.55 },
  { y: 0.88, amp: 0.07, len: 0.8, speed: 0.04, phase: 1.8, alpha: 0.72 },
];

function waveY(x, t, layer, w, h) {
  const base = layer.y * h;
  const amp = layer.amp * h;
  const k = (Math.PI * 2) / (layer.len * w);
  return (
    base +
    Math.sin(x * k + t * layer.speed + layer.phase) * amp +
    Math.sin(x * k * 2.15 + t * layer.speed * 1.35 + 1.7) * amp * 0.32 +
    Math.sin(x * k * 0.47 - t * layer.speed * 0.55) * amp * 0.22
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
  const horizon = h * 0.5;
  const y = horizon - (el / 70) * h * 0.42;
  return { x, y, el };
}

export function createSwell(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let running = true;
  let start = performance.now();
  let palette = skyPalette(new Date());

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
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, palette.zenith);
    sky.addColorStop(0.62, palette.horizon);
    sky.addColorStop(1, palette.water);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sun = sunPos(date, w, h);
    if (sun.el > -9) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 8, sun.x, sun.y, h * 0.42);
      glow.addColorStop(0, palette.sun);
      glow.addColorStop(0.12, palette.horizon);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.fillStyle = palette.sun;
      ctx.arc(sun.x, sun.y, Math.max(10, 18 + sun.el * 0.15), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const mx = w * 0.72;
      const my = h * 0.18;
      const moon = ctx.createRadialGradient(mx, my, 2, mx, my, 80);
      moon.addColorStop(0, "rgba(230,236,245,0.85)");
      moon.addColorStop(1, "rgba(230,236,245,0)");
      ctx.fillStyle = moon;
      ctx.fillRect(mx - 80, my - 80, 160, 160);
      ctx.beginPath();
      ctx.fillStyle = "rgba(228,234,242,0.8)";
      ctx.arc(mx, my, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    const haze = ctx.createLinearGradient(0, h * 0.38, 0, h * 0.55);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(0.5, "rgba(255,255,255,0.08)");
    haze.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * 0.38, w, h * 0.2);

    for (const layer of LAYERS) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      const step = Math.max(8, Math.round(w / 90));
      for (let x = 0; x <= w; x += step) {
        const y = waveY(x, t, layer, w, h);
        if (x === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, layer.y * h - 30, 0, h);
      fill.addColorStop(0, palette.water);
      fill.addColorStop(1, palette.waterDeep);
      ctx.globalAlpha = layer.alpha;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = palette.foam;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", resize);
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
