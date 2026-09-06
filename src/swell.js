import { skyPalette, isNightScene } from "./time.js";

const PCTS = [0, 8, 16, 25, 33, 41, 49, 57, 64, 72, 80, 88, 94, 100];

/** Full-night test plate: deep near-black, not the muted earth wash. */
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

/** Cool morning cream — brief lift out of night. */
const DAWN = [
  [244, 242, 248],
  [236, 232, 240],
  [226, 218, 228],
  [214, 202, 212],
  [200, 186, 196],
  [184, 170, 180],
  [166, 158, 170],
  [148, 150, 164],
  [130, 142, 158],
  [112, 128, 146],
  [94, 114, 132],
  [74, 92, 110],
  [56, 70, 86],
  [42, 52, 64],
];

/** Brighter daytime cream / warm pastel (day-wash-v37). */
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

/** Brief golden-hour rose / peach. */
const GOLDEN = [
  [255, 236, 220],
  [255, 220, 196],
  [248, 200, 172],
  [236, 176, 148],
  [220, 152, 128],
  [204, 132, 116],
  [184, 118, 110],
  [158, 112, 114],
  [134, 112, 118],
  [112, 108, 118],
  [90, 98, 110],
  [70, 84, 96],
  [54, 66, 76],
  [42, 50, 58],
];

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mix4(a, b, c, d, w) {
  return [
    Math.round(a[0] * w.night + b[0] * w.dawn + c[0] * w.day + d[0] * w.gold),
    Math.round(a[1] * w.night + b[1] * w.dawn + c[1] * w.day + d[1] * w.gold),
    Math.round(a[2] * w.night + b[2] * w.dawn + c[2] * w.day + d[2] * w.gold),
  ];
}

/** Elevation + azimuth weights. Night is the starry-black plate. */
export function washWeights(el, az) {
  const night = 1 - smoothstep(-16, -1, el);
  const day = smoothstep(4, 18, el);
  const twilight = Math.max(0, 1 - night - day);
  const evening = smoothstep(145, 215, az);
  return {
    night,
    dawn: twilight * (1 - evening),
    day,
    gold: twilight * evening,
  };
}

export function washGradient(weights) {
  const stops = STARRY.map((night, i) => {
    const [r, g, b] = mix4(night, DAWN[i], DAY[i], GOLDEN[i], weights);
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

/** Sun-driven wash + star field. Full night is the starry black test plate. */
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
    const w = washWeights(light.elevation, light.azimuth);
    root.dataset.light = night ? "night" : w.gold > 0.4 ? "gold" : "day";
    root.style.setProperty("--night-veil", "0");
    root.style.setProperty("--star-opacity", w.night.toFixed(3));
    const key = `${w.night.toFixed(3)}:${w.dawn.toFixed(3)}:${w.day.toFixed(3)}:${w.gold.toFixed(3)}`;
    if (key !== washKey) {
      washKey = key;
      root.style.setProperty("--wash", washGradient(w));
    }
    if (theme) {
      theme.setAttribute("content", night ? "#07080c" : "#fff6ea");
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
