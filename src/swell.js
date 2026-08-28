import { skyPalette } from "./time.js";
import coastUrl from "./assets/coast.png";

function applyGrade(root, light) {
  const { night, cool, overlayAlpha, vignette } = light;
  root.style.setProperty("--grade-day", overlayAlpha.toFixed(3));
  root.style.setProperty("--grade-night", (0.72 * night).toFixed(3));
  root.style.setProperty("--vignette", vignette.toFixed(3));
  root.style.setProperty("--type", light.type);
  root.style.setProperty("--cream", light.type);
  root.dataset.light = cool > 0.4 ? "day" : night > 0.45 ? "night" : "gold";
}

/** Plate + one time-of-day grade. No swell canvas — it blurred the photo. */
export function createSwell() {
  const root = document.documentElement;
  const plate = document.querySelector("#coast-plate");
  plate.src = coastUrl;
  plate.decoding = "async";

  let palette = skyPalette(new Date());
  applyGrade(root, palette);

  const tick = () => {
    palette = skyPalette(new Date());
    applyGrade(root, palette);
  };
  setInterval(tick, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") tick();
  });

  return {
    palette: () => palette,
  };
}
