import { SCENES, sceneAsset, sceneHref } from "./scenes.js";

const base = import.meta.env?.BASE_URL || "/live-tide/";
const list = document.querySelector("#scene-list");

SCENES.forEach((scene) => {
  const link = document.createElement("a");
  link.className = "scene-link";
  link.href = sceneHref(scene.id, base);
  const thumb = document.createElement("span");
  thumb.className = "scene-thumb";
  if (scene.id === "classic") {
    thumb.classList.add("is-classic");
    thumb.innerHTML = `
      <svg viewBox="0 0 160 90" aria-hidden="true">
        <path d="M0 58 C 24 40, 40 40, 64 58 S 104 76, 128 58 S 152 40, 160 46" fill="none" stroke="#f7f1e6" stroke-width="2.4"/>
      </svg>`;
  } else if (scene.sand) {
    thumb.classList.add("is-split");
    const water = document.createElement("img");
    water.alt = "";
    water.src = sceneAsset(scene.file, base);
    const sand = document.createElement("img");
    sand.alt = "";
    sand.src = sceneAsset(scene.sand, base);
    thumb.append(water, sand);
  } else {
    thumb.style.backgroundImage = `url("${sceneAsset(scene.file, base)}")`;
  }
  const title = document.createElement("span");
  title.className = "scene-title";
  title.textContent = scene.title;
  link.append(thumb, title);
  list?.append(link);
});
