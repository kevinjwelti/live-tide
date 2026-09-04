import { skyPalette, isNightScene } from "./time.js";

/**
 * Night stops match the current muted earth wash exactly.
 * Day stops are the same vertical story, lifted to a brighter cream / warm pastel.
 */
const WASH_STOPS = [
  [0, [246, 238, 226], [255, 251, 245]],
  [8, [240, 226, 208], [255, 244, 230]],
  [16, [232, 210, 192], [255, 232, 210]],
  [25, [221, 192, 174], [252, 217, 188]],
  [33, [208, 174, 156], [245, 200, 168]],
  [41, [196, 156, 140], [238, 184, 152]],
  [49, [180, 144, 136], [228, 176, 156]],
  [57, [154, 142, 140], [208, 192, 184]],
  [64, [132, 136, 144], [190, 200, 208]],
  [72, [114, 124, 136], [168, 184, 196]],
  [80, [94, 108, 120], [148, 168, 180]],
  [88, [72, 84, 92], [124, 144, 156]],
  [94, [56, 62, 68], [100, 116, 126]],
  [100, [42, 48, 54], [78, 88, 94]],
];

function mixChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}

export function washGradient(dayAmount) {
  const t = Math.min(1, Math.max(0, dayAmount));
  const stops = WASH_STOPS.map(([pct, night, day]) => {
    const r = mixChannel(night[0], day[0], t);
    const g = mixChannel(night[1], day[1], t);
    const b = mixChannel(night[2], day[2], t);
    return `rgb(${r}, ${g}, ${b}) ${pct}%`;
  });
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}

/** Color wash is CSS, tinted here from the active place's real sun. */
export function createSwell() {
  const root = document.documentElement;
  const theme = document.querySelector('meta[name="theme-color"]');
  let palette = skyPalette(new Date());
  let washKey = "";

  const apply = (light) => {
    palette = light;
    const night = isNightScene(light);
    const dayAmount = 1 - light.night;
    root.dataset.light = night ? "night" : light.cool > 0.4 ? "day" : "gold";
    root.style.setProperty("--night-veil", (0.4 * light.night).toFixed(3));
    const key = dayAmount.toFixed(3);
    if (key !== washKey) {
      washKey = key;
      root.style.setProperty("--wash", washGradient(dayAmount));
    }
    if (theme) {
      theme.setAttribute("content", night ? "#2a3036" : "#fff6ea");
    }
  };

  apply(palette);

  return {
    palette: () => palette,
    setTime(date) {
      apply(skyPalette(date));
    },
  };
}
