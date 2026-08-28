import { skyPalette, solarPosition, LJ_LAT, LJ_LON } from "./time.js";
import coastUrl from "./assets/coast.png";

const LAYERS = [
  { y: 0.58, amp: 0.012, len: 0.32, speed: 0.1, phase: 0.2, alpha: 0.07 },
  { y: 0.7, amp: 0.018, len: 0.48, speed: 0.07, phase: 1.4, alpha: 0.08 },
  { y: 0.82, amp: 0.024, len: 0.68, speed: 0.045, phase: 2.1, alpha: 0.09 },
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

function applyGrade(root, light) {
  const { night, photo } = light;
  root.style.setProperty("--plate-hue", `${photo.hue}deg`);
  root.style.setProperty("--plate-sat", photo.sat.toFixed(3));
  root.style.setProperty("--plate-bright", photo.bright.toFixed(3));
  root.style.setProperty("--plate-contrast", photo.contrast.toFixed(3));
  root.style.setProperty("--grade-color", light.overlayAlpha.toFixed(3));
  root.style.setProperty("--grade-soft", light.skyWash.toFixed(3));
  root.style.setProperty("--grade-sat", light.satBlend.toFixed(3));
  root.style.setProperty("--grade-vivid", light.vivid.toFixed(3));
  root.style.setProperty("--grade-water", light.waterWash.toFixed(3));
  root.style.setProperty("--grade-sky", light.skyCover.toFixed(3));
  root.style.setProperty("--grade-sun", light.sunHide.toFixed(3));
  root.style.setProperty("--grade-night", (0.78 * night).toFixed(3));
  root.style.setProperty("--vignette", light.vignette.toFixed(3));
  root.style.setProperty("--type", light.type);
  root.style.setProperty("--cream", light.type);
}

export function createSwell(canvas) {
  const ctx = canvas.getContext("2d", { alpha: true });
  const root = document.documentElement;
  const plate = document.querySelector("#coast-plate");
  plate.src = coastUrl;
  plate.decoding = "async";

  let running = true;
  let start = performance.now();
  let palette = skyPalette(new Date());
  applyGrade(root, palette);

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  };

  const draw = () => {
    if (!running) return;
    const t = (performance.now() - start) / 1000;
    const date = new Date();
    palette = skyPalette(date);
    applyGrade(root, palette);

    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    const warm = palette.warm;
    const cool = palette.cool;

    const sun = sunScreenPos(date, w, h);
    if (palette.sunInFrame > 0.08 && sun.el > -6 && warm > 0.35) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 6, sun.x, sun.y, h * 0.32);
      glow.addColorStop(0, palette.sun);
      glow.addColorStop(0.28, palette.horizon);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha = 0.28 * warm;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else if (palette.night > 0.55) {
      const mx = w * 0.72;
      const my = h * 0.16;
      const moon = ctx.createRadialGradient(mx, my, 2, mx, my, 70);
      moon.addColorStop(0, "rgba(230,236,245,0.35)");
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
      ctx.globalAlpha = layer.alpha * (0.55 + 0.45 * cool);
      ctx.fillStyle = palette.foam;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = palette.foam;
      ctx.lineWidth = 0.8;
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
