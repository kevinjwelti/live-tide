import { skyPalette, isNightScene } from "./time.js";
import dayUrl from "./assets/coast.png";
import nightUrl from "./assets/night.png";

function applyGrade(root, light, nightScene) {
  // Night photo is already dark navy. Do not multiply another gel on top.
  const overlayAlpha = nightScene ? 0 : light.overlayAlpha;
  const scrim = nightScene ? 0 : light.scrim;
  const vignette = nightScene ? 0.32 : light.vignette;
  root.style.setProperty("--grade-alpha", overlayAlpha.toFixed(3));
  root.style.setProperty("--grade-color", light.overlayColor);
  root.style.setProperty("--read-scrim", scrim.toFixed(3));
  root.style.setProperty("--vignette", vignette.toFixed(3));
  root.style.setProperty("--type", light.type);
  root.style.setProperty("--cream", light.type);
  root.dataset.light = nightScene ? "night" : light.cool > 0.4 ? "day" : "gold";
}

/** Plate + one sun-driven multiply gel. No swell canvas. */
export function createSwell() {
  const root = document.documentElement;
  const plate = document.querySelector("#coast-plate");
  plate.decoding = "async";

  const preload = new Image();
  preload.src = nightUrl;

  let nightOn = null;
  let palette = skyPalette(new Date());

  const applyPlate = (light) => {
    const nextNight = isNightScene(light);
    if (nextNight !== nightOn) {
      nightOn = nextNight;
      plate.src = nextNight ? nightUrl : dayUrl;
    }
    applyGrade(root, light, nextNight);
  };

  applyPlate(palette);

  return {
    palette: () => palette,
    setTime(date) {
      palette = skyPalette(date);
      applyPlate(palette);
    },
  };
}
