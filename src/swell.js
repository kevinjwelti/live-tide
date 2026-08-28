import { skyPalette, solarPosition, LJ_LAT, LJ_LON } from "./time.js";

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

export function createSwell(canvas) {
  const ctx = canvas.getContext("2d", { alpha: false });
  let running = true;
  let start = performance.now();
  let palette = skyPalette(new Date());
  const plate = new Image();
  plate.src = `${import.meta.env.BASE_URL}coast.jpg`;
  const graded = document.createElement("canvas");
  const gctx = graded.getContext("2d");
  let gradeKey = "";

  const resize = () => {
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gradeKey = "";
  };

  const rebuildGrade = (w, h, light) => {
    const key = `${w}x${h}:${light.gradeKey}`;
    if (key === gradeKey && graded.width) return;
    gradeKey = key;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    graded.width = Math.round(w * dpr);
    graded.height = Math.round(h * dpr);
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (plate.complete && plate.naturalWidth) {
      const p = light.photo;
      gctx.filter = `hue-rotate(${p.hue}deg) saturate(${p.sat}) brightness(${p.bright}) contrast(${p.contrast})`;
      drawCover(gctx, plate, w, h);
      gctx.filter = "none";
    } else {
      const sky = gctx.createLinearGradient(0, 0, 0, h * 0.62);
      sky.addColorStop(0, light.zenith);
      sky.addColorStop(0.62, light.horizon);
      sky.addColorStop(1, light.water);
      gctx.fillStyle = sky;
      gctx.fillRect(0, 0, w, h);
    }
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
    rebuildGrade(w, h, palette);
    ctx.drawImage(graded, 0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = palette.overlayMode;
    ctx.globalAlpha = palette.overlayAlpha;
    ctx.fillStyle = palette.overlay;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    if (palette.skyWash > 0.02) {
      const wash = ctx.createLinearGradient(0, 0, 0, h * 0.58);
      wash.addColorStop(0, palette.zenith);
      wash.addColorStop(0.55, palette.horizon);
      wash.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalAlpha = palette.skyWash;
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (palette.night > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.55 * palette.night;
      ctx.fillStyle = "rgb(10, 18, 36)";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    const sun = sunScreenPos(date, w, h);
    if (palette.sunInFrame > 0.08 && sun.el > -6) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 6, sun.x, sun.y, h * 0.38);
      glow.addColorStop(0, palette.sun);
      glow.addColorStop(0.2, palette.horizon);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = 0.35 + 0.65 * palette.warm;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      ctx.beginPath();
      ctx.fillStyle = palette.sun;
      ctx.globalAlpha = 0.35 + 0.5 * palette.sunInFrame;
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
      ctx.globalAlpha = layer.alpha * (0.7 + 0.3 * palette.cool);
      ctx.fillStyle = palette.water;
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.12;
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
    gradeKey = "";
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
