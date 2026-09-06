import { skyPalette, isNightScene } from "./time.js";

const PCTS = [0, 8, 16, 25, 33, 41, 49, 57, 64, 72, 80, 88, 94, 100];

/** Deep night — starry near-black. */
const STARRY = [
  [8, 10, 16],
  [7, 9, 15],
  [6, 8, 14],
  [6, 7, 13],
  [5, 7, 12],
  [5, 6, 11],
  [4, 6, 10],
  [4, 5, 10],
  [4, 5, 9],
  [3, 5, 8],
  [3, 4, 8],
  [3, 4, 7],
  [2, 3, 6],
  [2, 3, 6],
];

/** Late day / dusk / dawn — the muted earth wash Kevin already liked. */
const EARTH = [
  [246, 238, 226],
  [240, 226, 208],
  [232, 210, 192],
  [221, 192, 174],
  [208, 174, 156],
  [196, 156, 140],
  [180, 144, 136],
  [154, 142, 140],
  [132, 136, 144],
  [114, 124, 136],
  [94, 108, 120],
  [72, 84, 92],
  [56, 62, 68],
  [42, 48, 54],
];

/** Midday — brighter cream / warm pastel. */
const DAY = [
  [255, 251, 245],
  [255, 244, 230],
  [255, 232, 210],
  [252, 217, 188],
  [245, 200, 168],
  [238, 184, 152],
  [228, 176, 156],
  [208, 192, 184],
  [190, 200, 208],
  [168, 184, 196],
  [148, 168, 180],
  [124, 144, 156],
  [100, 116, 126],
  [78, 88, 94],
];

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mix3(a, b, c, wa, wb, wc) {
  return [
    Math.round(a[0] * wa + b[0] * wb + c[0] * wc),
    Math.round(a[1] * wa + b[1] * wb + c[1] * wc),
    Math.round(a[2] * wa + b[2] * wb + c[2] * wc),
  ];
}

/**
 * Solar-altitude blend. Same curve at dawn and dusk (no azimuth jump).
 *   el ≳ 26°  → bright day
 *   low sun   → muted earth
 *   after set → earth dissolves into starry black
 */
export function washWeights(el) {
  const starry = 1 - smoothstep(-16, 1, el);
  const day = smoothstep(10, 26, el);
  const earth = Math.max(0, 1 - starry - day);
  return { starry, earth, day };
}

export function washGradient(weights) {
  const { starry, earth, day } = weights;
  const stops = STARRY.map((night, i) => {
    const [r, g, b] = mix3(night, EARTH[i], DAY[i], starry, earth, day);
    return `rgb(${r}, ${g}, ${b}) ${PCTS[i]}%`;
  });
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}

function paintStars(canvas) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 8 || h < 8) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  let seed = 16807;
  const rnd = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };

  const count = Math.round((w * h) / 2400);
  for (let i = 0; i < count; i += 1) {
    const x = rnd() * w;
    const y = rnd() * h * (0.55 + rnd() * 0.4);
    const bright = rnd();
    const r = bright > 0.92 ? 1.15 + rnd() * 0.7 : 0.35 + rnd() * 0.75;
    const a = 0.22 + bright * 0.7;
    if (r > 1.1) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      glow.addColorStop(0, `rgba(230, 236, 255, ${a * 0.45})`);
      glow.addColorStop(1, "rgba(230, 236, 255, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.fillStyle = `rgba(236, 240, 255, ${a})`;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function createSwell() {
  const root = document.documentElement;
  const theme = document.querySelector('meta[name="theme-color"]');
  const stars = document.querySelector("#stars");
  let palette = skyPalette(new Date());
  let washKey = "";
  let starSize = "";

  const layoutStars = () => {
    if (!stars) return;
    const key = `${window.innerWidth}x${window.innerHeight}x${Math.min(2, window.devicePixelRatio || 1)}`;
    if (key === starSize) return;
    starSize = key;
    paintStars(stars);
  };

  const apply = (light) => {
    palette = light;
    const night = isNightScene(light);
    const w = washWeights(light.elevation);
    root.dataset.light = night ? "night" : w.earth > 0.45 ? "gold" : "day";
    root.style.setProperty("--star-opacity", w.starry.toFixed(3));
    const key = `${w.starry.toFixed(3)}:${w.earth.toFixed(3)}:${w.day.toFixed(3)}`;
    if (key !== washKey) {
      washKey = key;
      root.style.setProperty("--wash", washGradient(w));
    }
    if (theme) {
      const top = night ? "#07080c" : w.earth > 0.45 ? "#efe3d2" : "#fff6ea";
      theme.setAttribute("content", top);
    }
    layoutStars();
  };

  apply(palette);
  window.addEventListener("resize", () => {
    starSize = "";
    layoutStars();
  });

  return {
    palette: () => palette,
    setTime(date) {
      apply(skyPalette(date));
    },
  };
}
