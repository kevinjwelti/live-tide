import { skyPalette, isNightScene } from "./time.js";

/** Color wash is CSS. This only marks day/night for the sun/moon playhead. */
export function createSwell() {
  const root = document.documentElement;
  let palette = skyPalette(new Date());

  const apply = (light) => {
    palette = light;
    const night = isNightScene(light);
    root.dataset.light = night ? "night" : light.cool > 0.4 ? "day" : "gold";
    root.style.setProperty("--night-veil", (0.4 * light.night).toFixed(3));
  };

  apply(palette);

  return {
    palette: () => palette,
    setTime(date) {
      apply(skyPalette(date));
    },
  };
}
