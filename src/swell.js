import { skyPalette } from "./time.js";
import coastUrl from "./assets/coast.png";

function applyGrade(root, light) {
  root.style.setProperty("--grade-alpha", light.overlayAlpha.toFixed(3));
  root.style.setProperty("--grade-color", light.overlayColor);
  root.style.setProperty("--read-scrim", light.scrim.toFixed(3));
  root.style.setProperty("--vignette", light.vignette.toFixed(3));
  root.style.setProperty("--type", light.type);
  root.style.setProperty("--cream", light.type);
  root.dataset.light = light.cool > 0.4 ? "day" : light.night > 0.45 ? "night" : "gold";
}

/** Plate + one sun-driven multiply gel. No swell canvas. */
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
